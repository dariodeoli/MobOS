import { Prisma } from '@prisma/client'
import { prisma } from '../../../../lib/prisma'
import { error, json, tenantId } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { InputError, objectInput, textInput } from '../../../../lib/payment-input'
import { canManageDelivery, canUseDelivery } from '../../../../lib/delivery'

// Rendición del reparto: el repartidor entrega en la tienda el efectivo y las
// transferencias que cobró en la calle, junto con el saldo que quedó pendiente
// en cada pedido. La tienda (vendedor/caja/gerencia) la verifica: recién ahí
// los pre-cobros pasan a CONFIRMED y se reflejan en el pedido y en caja.

const settlementInclude = Prisma.validator<Prisma.DeliverySettlementInclude>()({
  deliveryUser: { select: { id: true, name: true } },
  verifiedBy: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  payments: {
    select: {
      id: true, amountPyg: true, method: true, status: true, reference: true, collectedAt: true, createdAt: true,
      order: { select: { id: true, orderNumber: true, totalPyg: true, fulfillmentStatus: true, customer: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  },
})

export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const esRepartidor = canUseDelivery(session.user)
  const esGestor = canManageDelivery(session.user)
  if (!esRepartidor && !esGestor) return error('No autorizado.', 403)
  const params = new URL(request.url).searchParams
  const pedido = (params.get('estado') || '').toUpperCase()
  const estados = ['PENDING', 'VERIFIED', 'REJECTED'] as const
  if (pedido && !(estados as readonly string[]).includes(pedido)) return error('Estado de rendición inválido.')
  const estado = (estados as readonly string[]).includes(pedido) ? pedido as (typeof estados)[number] : null
  const limit = Math.min(200, Math.max(1, Number(params.get('limit')) || 60))
  const where: Prisma.DeliverySettlementWhereInput = { tenantId: tenant }
  if (estado) where.status = estado
  if (esRepartidor && !esGestor) where.deliveryUserId = session.user.id
  else if (session.user.role !== 'ADMIN' && session.user.role !== 'GERENTE') where.branchId = session.user.branchId
  const rows = await prisma.deliverySettlement.findMany({ where, include: settlementInclude, orderBy: { createdAt: 'desc' }, take: limit })
  return json(rows)
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canUseDelivery(session.user)) return error('Solo el repartidor rinde sus cobros.', 403)
  try {
    const body = objectInput(await request.json().catch(() => ({})))
    if (Object.keys(body).some(key => key !== 'note')) throw new InputError('Campo no admitido en la rendición.')
    const note = body.note === undefined || body.note === null || body.note === '' ? null : textInput(body.note, 'Observación', 500)
    const settlement = await prisma.$transaction(async tx => {
      const cobros = await tx.$queryRaw<Array<{ id: string; amountPyg: number; orderId: string }>>`
        SELECT "id", "amountPyg", "orderId" FROM "Payment"
        WHERE "tenantId" = ${tenant} AND "deliveryUserId" = ${session.user.id} AND "status" = 'PENDING' AND "deliverySettlementId" IS NULL
        ORDER BY "createdAt" ASC
        FOR UPDATE
      `
      if (!cobros.length) throw new InputError('No hay cobros pendientes de rendir.', 409)
      const totalPyg = cobros.reduce((suma, cobro) => suma + cobro.amountPyg, 0)
      if (!Number.isSafeInteger(totalPyg)) throw new InputError('El total de la rendición está fuera de rango.')
      const orderIds = [...new Set(cobros.map(cobro => cobro.orderId))]
      // Saldo que queda vivo en cada pedido después de esta rendición: es lo
      // que el repartidor declara como "quedó pendiente".
      const [pedidos, confirmados] = await Promise.all([
        tx.order.findMany({ where: { id: { in: orderIds }, tenantId: tenant }, select: { id: true, totalPyg: true, status: true } }),
        tx.payment.groupBy({ by: ['orderId'], where: { tenantId: tenant, orderId: { in: orderIds }, status: 'CONFIRMED' }, _sum: { amountPyg: true } }),
      ])
      const confirmadoPorPedido = new Map(confirmados.map(row => [row.orderId, row._sum.amountPyg || 0]))
      const rendidoPorPedido = new Map<string, number>()
      for (const cobro of cobros) rendidoPorPedido.set(cobro.orderId, (rendidoPorPedido.get(cobro.orderId) || 0) + cobro.amountPyg)
      const pagados = new Set(pedidos.filter(pedido => pedido.status === 'COMPLETED').map(pedido => pedido.id))
      let pendingPyg = 0
      for (const pedido of pedidos) {
        if (pagados.has(pedido.id)) continue
        pendingPyg += Math.max(0, pedido.totalPyg - (confirmadoPorPedido.get(pedido.id) || 0) - (rendidoPorPedido.get(pedido.id) || 0))
      }
      const created = await tx.deliverySettlement.create({
        data: { tenantId: tenant, branchId: session.user.branchId, deliveryUserId: session.user.id, totalPyg, pendingPyg, ordersCount: orderIds.length, note },
        select: { id: true },
      })
      await tx.payment.updateMany({ where: { id: { in: cobros.map(cobro => cobro.id) }, tenantId: tenant }, data: { deliverySettlementId: created.id } })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'DELIVERY_SETTLEMENT_CREATED', entity: 'DeliverySettlement', entityId: created.id, metadata: { totalPyg, pendingPyg, ordersCount: orderIds.length, payments: cobros.length, ...(note ? { note } : {}) } } })
      return tx.deliverySettlement.findUniqueOrThrow({ where: { id: created.id }, include: settlementInclude })
    })
    return json(settlement, { status: 201 })
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo registrar la rendición.', cause instanceof InputError ? cause.status : 409)
  }
}
