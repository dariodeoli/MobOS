import { prisma } from '../../../../../../lib/prisma'
import { error, json, tenantId } from '../../../../../../lib/http'
import { requireSession } from '../../../../../../lib/auth'
import { InputError, objectInput, textInput } from '../../../../../../lib/payment-input'
import { assertCollectionWithinBalance, canUseDelivery, deliveryMethod } from '../../../../../../lib/delivery'

// Pre-cobro del repartidor en la calle: parcial o total, efectivo o
// transferencia. Nace PENDING (no entra a caja ni cierra el pedido) y viaja en
// la rendición. Nunca se cobra por encima del saldo: la cuenta incluye los
// otros pre-cobros del pedido para que un reintento no duplique el cobro.
export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canUseDelivery(session.user)) return error('No autorizado.', 403)
  const idempotencyKey = request.headers.get('Idempotency-Key') || null
  if (idempotencyKey && !/^[a-zA-Z0-9_-]{16,100}$/.test(idempotencyKey)) return error('Identificador de operación inválido.')
  try {
    const { orderId } = await context.params
    const body = objectInput(await request.json())
    if (Object.keys(body).some(key => !['amountPyg', 'method', 'reference'].includes(key))) throw new InputError('Campo no admitido en el cobro.')
    const amountPyg = Number(body.amountPyg)
    if (!Number.isSafeInteger(amountPyg) || amountPyg <= 0) throw new InputError('Monto entero positivo obligatorio.')
    const method = deliveryMethod(body.method)
    const reference = body.reference === undefined || body.reference === null || body.reference === '' ? null : textInput(body.reference, 'Referencia', 200)
    const payment = await prisma.$transaction(async tx => {
      // La fila del pedido se bloquea: dos cobros concurrentes del mismo
      // repartidor no pueden pasar los dos el control de saldo.
      const locked = await tx.$queryRaw<Array<{ id: string; status: string; totalPyg: number; orderNumber: string; assignedToId: string | null }>>`
        SELECT "id", "status", "totalPyg", "orderNumber", "assignedToId" FROM "Order"
        WHERE "id" = ${orderId} AND "tenantId" = ${tenant} FOR UPDATE
      `
      const order = locked[0]
      if (!order || order.assignedToId !== session.user.id) throw new InputError('Pedido no encontrado entre tus repartos.', 404)
      if (order.status === 'CANCELLED') throw new InputError('Un pedido cancelado no admite cobros.', 409)
      if (idempotencyKey) {
        const previous = await tx.payment.findUnique({ where: { tenantId_idempotencyKey: { tenantId: tenant, idempotencyKey } } })
        if (previous) {
          if (previous.orderId !== order.id || previous.amountPyg !== amountPyg || previous.method !== method || previous.deliveryUserId !== session.user.id) throw new InputError('El identificador ya pertenece a otro cobro.', 409)
          return previous
        }
      }
      const totales = await tx.payment.groupBy({ by: ['status'], where: { tenantId: tenant, orderId: order.id, status: { in: ['CONFIRMED', 'PENDING'] } }, _sum: { amountPyg: true } })
      const confirmado = totales.find(row => row.status === 'CONFIRMED')?._sum.amountPyg || 0
      const preCobrado = totales.find(row => row.status === 'PENDING')?._sum.amountPyg || 0
      assertCollectionWithinBalance(order.totalPyg, confirmado, preCobrado, amountPyg)
      const created = await tx.payment.create({
        data: { tenantId: tenant, orderId: order.id, method, status: 'PENDING', amountPyg, reference, deliveryUserId: session.user.id, collectedAt: new Date(), userId: session.user.id, createdById: session.user.id, idempotencyKey },
      })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'DELIVERY_COLLECTION_RECORDED', entity: 'Payment', entityId: created.id, metadata: { orderId: order.id, orderNumber: order.orderNumber, amountPyg, method, reference, status: 'PENDING' } } })
      return created
    })
    return json(payment, { status: 201 })
  } catch (cause) {
    if ((cause as { code?: string })?.code === 'P2002' && idempotencyKey) {
      const previous = await prisma.payment.findUnique({ where: { tenantId_idempotencyKey: { tenantId: tenant, idempotencyKey } } })
      if (previous) return json(previous, { status: 201 })
    }
    return error(cause instanceof Error ? cause.message : 'No se pudo registrar el cobro.', cause instanceof InputError ? cause.status : 409)
  }
}
