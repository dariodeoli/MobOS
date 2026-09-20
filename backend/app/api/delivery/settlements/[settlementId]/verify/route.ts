import { Prisma } from '@prisma/client'
import { prisma } from '../../../../../../lib/prisma'
import { error, json, tenantId } from '../../../../../../lib/http'
import { requireSession } from '../../../../../../lib/auth'
import { InputError, objectInput, textInput } from '../../../../../../lib/payment-input'
import { canManageDelivery } from '../../../../../../lib/delivery'

// Verificación de la rendición en la tienda (vendedor/caja/gerencia). Al
// confirmarla, los pre-cobros del repartidor pasan a CONFIRMED —y con eso
// entran a caja/finanzas y cierran el saldo del pedido—, cada pago queda
// registrado en la conciliación como el resto de los cobros, y el pedido se
// completa si quedó pagado. Rechazarla deja los cobros sin efecto para que el
// repartidor los vuelva a registrar.

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

export async function POST(request: Request, context: { params: Promise<{ settlementId: string }> }) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canManageDelivery(session.user)) return error('No autorizado para verificar rendiciones.', 403)
  try {
    const { settlementId } = await context.params
    const body = objectInput(await request.json())
    if (Object.keys(body).some(key => !['state', 'note'].includes(key))) throw new InputError('Campo no admitido al verificar la rendición.')
    const state = String(body.state || '').toUpperCase()
    if (!['VERIFIED', 'REJECTED'].includes(state)) throw new InputError('La rendición se verifica o se rechaza.')
    const note = body.note === undefined || body.note === null || body.note === '' ? null : textInput(body.note, 'Observación', 500)
    const result = await prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string; deliveryUserId: string; branchId: string | null; totalPyg: number }>>`
        SELECT "id", "status", "deliveryUserId", "branchId", "totalPyg" FROM "DeliverySettlement"
        WHERE "id" = ${settlementId} AND "tenantId" = ${tenant} FOR UPDATE
      `
      const settlement = rows[0]
      if (!settlement) throw new InputError('Rendición no encontrada.', 404)
      if (settlement.branchId && session.user.role !== 'ADMIN' && session.user.role !== 'GERENTE' && session.user.branchId !== settlement.branchId) throw new InputError('La rendición pertenece a otra sucursal.', 403)
      if (settlement.status !== 'PENDING') throw new InputError('La rendición ya fue verificada.', 409)
      const payments = await tx.payment.findMany({ where: { tenantId: tenant, deliverySettlementId: settlement.id }, select: { id: true, orderId: true, amountPyg: true } })
      if (state === 'REJECTED') {
        await tx.payment.updateMany({ where: { tenantId: tenant, deliverySettlementId: settlement.id, status: 'PENDING' }, data: { status: 'REJECTED' } })
        for (const payment of payments) {
          await tx.paymentReconciliation.upsert({
            where: { paymentId: payment.id },
            create: { tenantId: tenant, paymentId: payment.id, state: 'REJECTED', note, verifiedById: session.user.id },
            update: { state: 'REJECTED', note, verifiedById: session.user.id },
          })
        }
        const updated = await tx.deliverySettlement.update({ where: { id: settlement.id }, data: { status: 'REJECTED', verifiedById: session.user.id, verifiedAt: new Date(), verificationNote: note }, include: settlementInclude })
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'DELIVERY_SETTLEMENT_REJECTED', entity: 'DeliverySettlement', entityId: settlement.id, metadata: { totalPyg: settlement.totalPyg, payments: payments.length, repartidor: updated.deliveryUser.name, ...(note ? { note } : {}) } } })
        return updated
      }
      // Verificada: el dinero entra a caja/finanzas y el pedido cierra si con
      // este cobro quedó saldado (misma regla que el resto de los pagos). El
      // efectivo entra al cajón al verificarse, no cuando se cobró en la calle:
      // `paidAt` se fija acá (la caja lo usa para el esperado de la sesión) y
      // `collectedAt` conserva el momento real del cobro.
      await tx.payment.updateMany({ where: { tenantId: tenant, deliverySettlementId: settlement.id, status: 'PENDING' }, data: { status: 'CONFIRMED', paidAt: new Date() } })
      for (const payment of payments) {
        await tx.paymentReconciliation.upsert({
          where: { paymentId: payment.id },
          create: { tenantId: tenant, paymentId: payment.id, state: 'VERIFIED', note, verifiedById: session.user.id },
          update: { state: 'VERIFIED', note, verifiedById: session.user.id },
        })
      }
      const orderIds = [...new Set(payments.map(payment => payment.orderId))]
      const pedidos = await tx.order.findMany({ where: { id: { in: orderIds }, tenantId: tenant }, select: { id: true, status: true, totalPyg: true } })
      const confirmados = await tx.payment.groupBy({ by: ['orderId'], where: { tenantId: tenant, orderId: { in: orderIds }, status: 'CONFIRMED' }, _sum: { amountPyg: true } })
      const porPedido = new Map(confirmados.map(row => [row.orderId, row._sum.amountPyg || 0]))
      const cerrados: string[] = []
      for (const pedido of pedidos) {
        if (pedido.status === 'CANCELLED') continue
        if ((porPedido.get(pedido.id) || 0) >= pedido.totalPyg) {
          await tx.order.update({ where: { id: pedido.id }, data: { status: 'COMPLETED' } })
          cerrados.push(pedido.id)
        }
      }
      const updated = await tx.deliverySettlement.update({ where: { id: settlement.id }, data: { status: 'VERIFIED', verifiedById: session.user.id, verifiedAt: new Date(), verificationNote: note }, include: settlementInclude })
      const metadata = { settlementId: settlement.id, totalPyg: settlement.totalPyg, pendingPyg: updated.pendingPyg, payments: payments.length, ordersClosed: cerrados.length, repartidor: updated.deliveryUser.name, ...(note ? { note } : {}) }
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'DELIVERY_SETTLEMENT_VERIFIED', entity: 'DeliverySettlement', entityId: settlement.id, metadata } })
      // Un asiento por pedido: la cronología de cada pedido muestra que su
      // cobro de calle quedó confirmado en la rendición.
      for (const orderId of orderIds) {
        const montoPedido = payments.filter(payment => payment.orderId === orderId).reduce((suma, payment) => suma + payment.amountPyg, 0)
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'DELIVERY_SETTLEMENT_VERIFIED', entity: 'Order', entityId: orderId, metadata: { ...metadata, amountPyg: montoPedido } } })
      }
      return updated
    })
    return json(result)
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo verificar la rendición.', cause instanceof InputError ? cause.status : 409)
  }
}
