import { prisma } from '../../../../lib/prisma'
import { Prisma } from '@prisma/client'
import { error, json, tenantId } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { InputError, objectInput, textInput } from '../../../../lib/payment-input'
import { canAccessOrder, validateFulfillmentTransition } from '../../../../lib/orders'

const orderInclude = Prisma.validator<Prisma.OrderInclude>()({
  items: true,
  payments: true,
  customer: { include: { addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] } } },
  seller: { select: { id: true, name: true } },
})

export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const { orderId } = await context.params
  const order = await prisma.order.findFirst({ where: { id: orderId, tenantId: tenant }, include: orderInclude })
  if (!order || !canAccessOrder(session.user, order)) return error('Pedido no encontrado.', 404)
  return json(order)
}

export async function PATCH(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  try {
    const { orderId } = await context.params
    const body = objectInput(await request.json())
    if (Object.keys(body).some(key => !['fulfillmentStatus', 'deliveryType', 'deliveryNotes'].includes(key))) throw new InputError('Solo se puede actualizar el estado y las notas de entrega.')
    const existing = await prisma.order.findFirst({ where: { id: orderId, tenantId: tenant }, select: { id: true, sellerId: true, branchId: true, status: true, fulfillmentStatus: true } })
    if (!existing || !canAccessOrder(session.user, existing)) return error('Pedido no encontrado.', 404)
    if (existing.status === 'CANCELLED') throw new InputError('Un pedido cancelado no admite cambios.', 409)
    const fulfillmentStatus = body.fulfillmentStatus === undefined ? undefined : validateFulfillmentTransition(existing.fulfillmentStatus, body.fulfillmentStatus)
    const deliveryType = body.deliveryType === undefined ? undefined : textInput(body.deliveryType, 'Tipo de entrega', 100)
    const deliveryNotes = body.deliveryNotes === undefined ? undefined : textInput(body.deliveryNotes, 'Observaciones de entrega', 2000)
    if (fulfillmentStatus === undefined && deliveryType === undefined && deliveryNotes === undefined) throw new InputError('Indicá al menos un cambio de entrega.')
    const order = await prisma.$transaction(async tx => {
      const updated = await tx.order.update({ where: { id: existing.id }, data: { ...(fulfillmentStatus === undefined ? {} : { fulfillmentStatus }), ...(deliveryType === undefined ? {} : { deliveryType }), ...(deliveryNotes === undefined ? {} : { deliveryNotes }) }, include: orderInclude })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'ORDER_FULFILLMENT_UPDATED', entity: 'Order', entityId: updated.id, metadata: { previous: existing.fulfillmentStatus, current: updated.fulfillmentStatus, deliveryType: updated.deliveryType } } })
      return updated
    })
    return json(order)
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo actualizar el pedido.', cause instanceof InputError ? cause.status : 400) }
}
