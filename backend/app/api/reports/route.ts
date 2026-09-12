import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import {
  MAX_REPORT_ORDERS,
  REPORT_ROLES,
  ReportInputError,
  aggregateReport,
  dayBounds,
  parseReportQuery,
} from '../../../lib/reporting'

// Reportes por producto, categoría, vendedor o día.
//
// Alcance: ADMIN y GERENTE, siempre dentro de su propia empresa. El reporte no
// recalcula nada histórico: usa los importes y el costo congelado de cada línea.
// Un `branchId` opcional acota a una sucursal activa de la misma empresa.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!(REPORT_ROLES as readonly string[]).includes(session.user.role)) return error('No autorizado.', 403)

  const url = new URL(request.url)
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
        payments: { select: { status: true, amountPyg: true } },
        seller: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_REPORT_ORDERS + 1,
    })

    const truncated = orders.length > MAX_REPORT_ORDERS
    const usadas = truncated ? orders.slice(0, MAX_REPORT_ORDERS) : orders
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
        payments: orden.payments.map((pago) => ({ status: pago.status, amountPyg: pago.amountPyg })),
      })),
      { groupBy, offsetMinutes },
    )

    return json({
      from,
      to,
      groupBy,
      offsetMinutes,
      branchId,
      truncated,
      generatedAt: new Date().toISOString(),
      ...reporte,
    })
  } catch (e) {
    if (e instanceof ReportInputError) return error(e.message)
    return error('No se pudo generar el reporte.', 500)
  }
}
