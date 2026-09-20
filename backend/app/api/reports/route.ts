import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { canAccessAny, requireSession } from '../../../lib/auth'
import {
  MAX_REPORT_ORDERS,
  ReportInputError,
  aggregateCommissions,
  aggregateReport,
  dayBounds,
  localDayKey,
  parseReportQuery,
} from '../../../lib/reporting'

// Reportes por producto, categoría, vendedor o día, y comisiones por vendedor.
//
// Alcance: ADMIN y GERENTE, siempre dentro de su propia empresa. El reporte no
// recalcula nada histórico: usa los importes y el costo congelado de cada línea.
// Un `branchId` opcional acota a una sucursal activa de la misma empresa.
// Con `type=commissions` se devuelve la comisión por vendedor según las reglas
// vigentes (por usuario o por rol), calculada sobre el margen de cada venta.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['reports:read'])) return error('No autorizado.', 403)

  const url = new URL(request.url)
  const type = (url.searchParams.get('type') || '').trim()
  if (type && type !== 'commissions') return error('Tipo de reporte inválido.')
  const parsed = parseReportQuery(url.searchParams)
  if (!parsed.ok) return error(parsed.error)
  const { from, to, groupBy, offsetMinutes } = parsed.value

  try {
    const { start, end } = dayBounds(from, to, offsetMinutes)

    const solicitada = (url.searchParams.get('branchId') || '').trim()
    let branchId: string | null = null
    if (solicitada) {
      const branch = await prisma.branch.findFirst({
        where: { id: solicitada, tenantId: session.user.tenantId, isActive: true },
        select: { id: true },
      })
      if (!branch) return error('Sucursal no encontrada.', 404)
      branchId = branch.id
    }

    const orders = await prisma.order.findMany({
      where: {
        tenantId: session.user.tenantId,
        createdAt: { gte: start, lt: end },
        ...(branchId ? { branchId } : {}),
      },
      include: {
        branch: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        items: {
          select: {
            productId: true,
            description: true,
            quantity: true,
            unitCostPyg: true,
            totalPyg: true,
            product: { select: { name: true, category: true } },
          },
        },
        payments: { select: { status: true, amountPyg: true, method: true, accountSnapshot: true } },
        seller: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_REPORT_ORDERS + 1,
    })

    const truncated = orders.length > MAX_REPORT_ORDERS
    const usadas = truncated ? orders.slice(0, MAX_REPORT_ORDERS) : orders

    if (type === 'commissions') {
      const rules = await prisma.commissionRule.findMany({
        where: { tenantId: session.user.tenantId },
        select: { userId: true, role: true, percentPyg: true },
      })
      const sellers: Record<string, { name: string | null; role: string | null }> = {}
      for (const order of usadas) {
        if (!order.sellerId || sellers[order.sellerId]) continue
        sellers[order.sellerId] = { name: order.seller?.name ?? null, role: order.seller?.role ?? null }
      }
      const commissions = aggregateCommissions(
        usadas.map((orden) => ({
          id: orden.id,
          status: orden.status,
          subtotalPyg: orden.subtotalPyg,
          discountPyg: orden.discountPyg,
          deliveryPyg: orden.deliveryPyg,
          totalPyg: orden.totalPyg,
          sellerId: orden.sellerId,
          sellerName: orden.seller?.name ?? null,
          createdAt: orden.createdAt,
          items: orden.items.map((item) => ({
            productId: item.productId,
            description: item.description,
            productName: item.product?.name ?? null,
            category: item.product?.category ?? null,
            quantity: item.quantity,
            unitCostPyg: item.unitCostPyg,
            totalPyg: item.totalPyg,
          })),
        })),
        rules.map((rule) => ({ userId: rule.userId, role: rule.role, percentPyg: rule.percentPyg === null ? null : Number(rule.percentPyg) })),
        sellers,
      )
      return json({
        from,
        to,
        type: 'commissions',
        offsetMinutes,
        branchId,
        truncated,
        generatedAt: new Date().toISOString(),
        rules: rules.map((rule) => ({ userId: rule.userId, role: rule.role, percentPyg: rule.percentPyg })),
        ...commissions,
      })
    }

    // Primera orden histórica de cada cliente: define "cliente nuevo" por mes
    // en la agrupación newCustomers, sin depender del rango consultado.
    const firstOrderMonth = new Map<string, string>()
    if (groupBy === 'newCustomers') {
      const primeras = await prisma.order.groupBy({
        by: ['customerId'],
        _min: { createdAt: true },
        where: { tenantId: session.user.tenantId, customerId: { not: null } },
      })
      for (const fila of primeras) {
        if (fila.customerId && fila._min.createdAt) {
          firstOrderMonth.set(fila.customerId, localDayKey(fila._min.createdAt, offsetMinutes).slice(0, 7))
        }
      }
    }

    if (groupBy === 'returns') {
      const eventos = await prisma.auditLog.findMany({
        where: { tenantId: session.user.tenantId, action: { in: ['ORDER_RETURN_RECORDED', 'ORDER_EXCHANGE_RECORDED', 'ORDER_CANCELLED'] }, createdAt: { gte: start, lt: end }, ...(branchId ? { metadata: { path: ['branchId'], equals: branchId } } : {}) },
        select: { metadata: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      })
      const grupos = new Map<string, { key: string; label: string; orders: number; units: number; grossPyg: number; discountPyg: number; deliveryPyg: number; totalPyg: number; collectedPyg: number; pendingPyg: number; costPyg: number; profitPyg: number; salesWithoutCostPyg: number; linesWithoutCost: number; commissionPyg: number; netProfitPyg: number; refundedPyg: number; customers: number; newCustomers: number; returningCustomers: number; ultima: string }>()
      for (const evento of eventos) {
        const meta = evento.metadata && typeof evento.metadata === 'object' ? evento.metadata as Record<string, unknown> : {}
        const motivo = String(meta.reason || 'Sin motivo').slice(0, 120)
        const reembolso = Number(meta.refundPyg || 0)
        const item = grupos.get(motivo) || { key: motivo, label: motivo, orders: 0, units: 0, grossPyg: 0, discountPyg: 0, deliveryPyg: 0, totalPyg: 0, collectedPyg: 0, pendingPyg: 0, costPyg: 0, profitPyg: 0, salesWithoutCostPyg: 0, linesWithoutCost: 0, commissionPyg: 0, netProfitPyg: 0, refundedPyg: 0, customers: 0, newCustomers: 0, returningCustomers: 0, ultima: '' }
        item.orders += 1
        item.totalPyg += reembolso
        item.grossPyg += reembolso
        item.refundedPyg += reembolso
        item.ultima = !item.ultima || new Date(evento.createdAt) > new Date(item.ultima) ? evento.createdAt.toISOString().slice(0, 10) : item.ultima
        grupos.set(motivo, item)
      }
      const groups = [...grupos.values()].sort((a, b) => b.orders - a.orders)
      const totalPyg = groups.reduce((suma, item) => suma + item.totalPyg, 0)
      return json({
        from, to, groupBy, offsetMinutes, branchId, truncated: false, generatedAt: new Date().toISOString(),
        totals: { orders: groups.length, units: 0, grossPyg: totalPyg, discountPyg: 0, deliveryPyg: 0, totalPyg, collectedPyg: 0, pendingPyg: 0, costPyg: 0, profitPyg: 0, salesWithCostPyg: 0, salesWithoutCostPyg: 0, linesWithoutCost: 0, marginPct: null, commissionPyg: 0, netProfitPyg: 0, netMarginPct: null, refundedPyg: totalPyg },
        groups,
      })
    }

    const reporte = aggregateReport(
      usadas.map((orden) => ({
        id: orden.id,
        status: orden.status,
        subtotalPyg: orden.subtotalPyg,
        discountPyg: orden.discountPyg,
        deliveryPyg: orden.deliveryPyg,
        totalPyg: orden.totalPyg,
        sellerId: orden.sellerId,
        sellerName: orden.seller?.name ?? null,
        customerId: orden.customerId ?? null,
        customerName: orden.customer?.name ?? null,
        branchId: orden.branchId ?? null,
        branchName: orden.branch?.name ?? null,
        createdAt: orden.createdAt,
        items: orden.items.map((item) => ({
          productId: item.productId,
          description: item.description,
          productName: item.product?.name ?? null,
          category: item.product?.category ?? null,
          quantity: item.quantity,
          unitCostPyg: item.unitCostPyg,
          totalPyg: item.totalPyg,
        })),
        payments: orden.payments.map((pago) => {
          const snapshot = pago.accountSnapshot && typeof pago.accountSnapshot === 'object' && !Array.isArray(pago.accountSnapshot)
            ? pago.accountSnapshot as Record<string, unknown> : null
          const feePercent = snapshot && (typeof snapshot.feePercent === 'number' || typeof snapshot.feePercent === 'string')
            ? Number(snapshot.feePercent) : 0
          const feePyg = Number.isFinite(feePercent) && feePercent > 0
            ? Math.round((pago.amountPyg * feePercent) / 100) : 0
          return { status: pago.status, amountPyg: pago.amountPyg, feePyg, method: pago.method ?? null, accountName: snapshot && typeof snapshot.name === 'string' ? snapshot.name : null }
        }),
      })),
      { groupBy, offsetMinutes, firstOrderMonth },
    )

    let unitAge: Map<string, { oldest: Date; available: number }> = new Map()
    if (groupBy === 'product') {
      const grouped = await prisma.inventoryUnit.groupBy({
        by: ['productId'],
        where: { tenantId: session.user.tenantId, status: 'AVAILABLE', ...(branchId ? { branchId } : {}) },
        _min: { createdAt: true },
        _count: { _all: true },
      })
      unitAge = new Map(grouped.map(row => [row.productId, { oldest: row._min.createdAt as Date, available: row._count._all }]))
    }

    // Período anterior para variación % (mismo largo, corrido hacia atrás).
    const spanMs = end.getTime() - start.getTime()
    const prevStart = new Date(start.getTime() - spanMs)
    const prevEnd = new Date(start)
    const previousOrders = await prisma.order.findMany({
      where: { tenantId: session.user.tenantId, createdAt: { gte: prevStart, lt: prevEnd }, ...(branchId ? { branchId } : {}) },
      include: { items: true, payments: true, customer: { select: { id: true, name: true } }, seller: { select: { id: true, name: true } }, branch: { select: { id: true, name: true } } },
      take: MAX_REPORT_ORDERS,
    })
    const previousReport = aggregateReport(previousOrders.map((orden) => ({
      id: orden.id, status: orden.status, subtotalPyg: orden.subtotalPyg, discountPyg: orden.discountPyg, deliveryPyg: orden.deliveryPyg, totalPyg: orden.totalPyg,
      sellerId: orden.sellerId, sellerName: orden.seller?.name ?? null, customerId: orden.customerId ?? null, customerName: orden.customer?.name ?? null,
      branchId: orden.branchId ?? null, branchName: orden.branch?.name ?? null, createdAt: orden.createdAt,
      items: orden.items.map((item) => ({ productId: item.productId, description: item.description, productName: null, category: null, quantity: item.quantity, unitCostPyg: item.unitCostPyg, totalPyg: item.totalPyg })),
      payments: orden.payments.map((pago) => ({ status: pago.status, amountPyg: pago.amountPyg })),
    })), { groupBy, offsetMinutes })

    const productStock = await prisma.product.findMany({
      where: { tenantId: session.user.tenantId, isActive: true, ...(branchId ? { branchId } : {}) },
      select: { id: true, name: true, sku: true, stock: true },
      orderBy: [{ stock: 'asc' }, { name: 'asc' }],
      take: 1000,
    })
    const soldByProduct = new Map<string, number>()
    for (const order of usadas) for (const item of order.items) {
      if (!item.productId || order.status === 'CANCELLED') continue
      soldByProduct.set(item.productId, (soldByProduct.get(item.productId) ?? 0) + item.quantity)
    }
    const onHand = productStock.reduce((sum, product) => sum + product.stock, 0)
    const soldUnits = [...soldByProduct.values()].reduce((sum, quantity) => sum + quantity, 0)
    const shortages = productStock.filter(product => product.stock <= 0).map(product => ({ id: product.id, name: product.name, sku: product.sku, stock: product.stock }))

    const reportGroups = reporte.groups.map(group => {
      if (groupBy !== 'product') return group
      const age = unitAge.get(group.key)
      return { ...group, availableUnits: age?.available ?? 0, oldestUnitAt: age?.oldest?.toISOString() ?? null }
    })

    return json({
      from,
      to,
      groupBy,
      offsetMinutes,
      branchId,
      truncated,
      generatedAt: new Date().toISOString(),
      previous: { from: prevStart.toISOString().slice(0, 10), to: (new Date(prevEnd.getTime() - 1).toISOString().slice(0, 10)), totals: previousReport.totals },
      inventory: {
        onHandUnits: onHand,
        soldUnits,
        sellThroughPct: onHand + soldUnits > 0 ? Math.round((soldUnits / (onHand + soldUnits)) * 1000) / 10 : null,
        shortages,
      },
      groups: reportGroups, totals: reporte.totals,
    })
  } catch (e) {
    if (e instanceof ReportInputError) return error(e.message)
    return error('No se pudo generar el reporte.', 500)
  }
}
