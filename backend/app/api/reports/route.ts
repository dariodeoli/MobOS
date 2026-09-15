import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import {
  MAX_REPORT_ORDERS,
  REPORT_ROLES,
  ReportInputError,
  aggregateCommissions,
  aggregateReport,
  dayBounds,
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
  if (!(REPORT_ROLES as readonly string[]).includes(session.user.role)) return error('No autorizado.', 403)

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
        payments: { select: { status: true, amountPyg: true, accountSnapshot: true } },
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
        rules.map((rule) => ({ userId: rule.userId, role: rule.role, percentPyg: rule.percentPyg })),
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
          return { status: pago.status, amountPyg: pago.amountPyg, feePyg }
        }),
      })),
      { groupBy, offsetMinutes },
    )

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

    return json({
      from,
      to,
      groupBy,
      offsetMinutes,
      branchId,
      truncated,
      generatedAt: new Date().toISOString(),
      inventory: {
        onHandUnits: onHand,
        soldUnits,
        sellThroughPct: onHand + soldUnits > 0 ? Math.round((soldUnits / (onHand + soldUnits)) * 1000) / 10 : null,
        shortages,
      },
      ...reporte,
    })
  } catch (e) {
    if (e instanceof ReportInputError) return error(e.message)
    return error('No se pudo generar el reporte.', 500)
  }
}
