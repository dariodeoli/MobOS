import { prisma } from '../../../../lib/prisma'
import { Prisma } from '@prisma/client'
import { error, json, tenantId } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { InputError, objectInput, textInput } from '../../../../lib/payment-input'
import { canAccessOrder, validateFulfillmentTransition } from '../../../../lib/orders'
import { serialKey } from '../../../../lib/validation'
import { changeStock } from '../../../../lib/stock'

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
    if (Object.keys(body).some(key => !['fulfillmentStatus', 'deliveryType', 'deliveryNotes', 'action', 'itemId', 'serials', 'billingName', 'billingDocument', 'notes', 'tags'].includes(key))) throw new InputError('Campo no admitido al actualizar el pedido.')
    const existing = await prisma.order.findFirst({ where: { id: orderId, tenantId: tenant }, include: { items: true } })
    if (!existing || !canAccessOrder(session.user, existing)) return error('Pedido no encontrado.', 404)
    if (existing.status === 'CANCELLED') throw new InputError('Un pedido cancelado no admite cambios.', 409)

    // ── Entregar equipos sobre pedido: agregar IMEI/seriales a una línea ──
    if (body.action !== undefined) {
      // Archivar/desarchivar: no borra nada, solo lo saca del listado activo.
      if (body.action === 'archive' || body.action === 'unarchive') {
        const archivedAt = body.action === 'archive' ? new Date() : null
        const order = await prisma.$transaction(async tx => {
          const updated = await tx.order.update({ where: { id: existing.id }, data: { archivedAt }, include: orderInclude })
          await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: archivedAt ? 'ORDER_ARCHIVED' : 'ORDER_UNARCHIVED', entity: 'Order', entityId: existing.id, metadata: {} } })
          return updated
        })
        return json(order)
      }
      if (body.action === 'markNotified') {
        const order = await prisma.$transaction(async tx => {
          const updated = await tx.order.update({ where: { id: existing.id }, data: { notifiedAt: new Date() }, include: orderInclude })
          await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'ORDER_NOTIFIED_WHATSAPP', entity: 'Order', entityId: existing.id, metadata: { fulfillmentStatus: existing.fulfillmentStatus } } })
          return updated
        })
        return json(order)
      }
      if (body.action !== 'attachSerials') throw new InputError('Acción de pedido inválida.')
      const itemId = textInput(body.itemId, 'Línea de pedido', 200)
      if (!itemId) throw new InputError('Indicá la línea del pedido.')
      const serials = Array.isArray(body.serials) ? body.serials.map(serialKey).filter(Boolean) : []
      if (!serials.length || serials.length > 100 || new Set(serials).size !== serials.length) throw new InputError('Indicá entre 1 y 100 IMEI/seriales distintos.')
      const updated = await prisma.$transaction(async tx => {
        const item = existing.items.find(row => row.id === itemId)
        if (!item) throw new InputError('Línea no encontrada en el pedido.')
        if (item.serialsPending < serials.length) throw new InputError(`La línea solo espera ${item.serialsPending} IMEI/serial(es) pendiente(s).`)
        const existingSerials = new Set(existing.items.flatMap(row => (Array.isArray(row.serials) ? row.serials : [])))
        if (serials.some(serial => existingSerials.has(serial))) throw new InputError('Ese IMEI/serial ya está en el pedido.')
        for (const serial of serials) {
          if (!item.productId) continue
          const unit = await tx.inventoryUnit.findFirst({ where: { tenantId: tenant, serial, productId: item.productId } })
          if (unit) {
            if (!['AVAILABLE', 'RESERVED'].includes(unit.status)) throw new InputError(`El IMEI ${serial} no está disponible para esta entrega.`, 409)
            await tx.inventoryUnit.update({ where: { id: unit.id }, data: { status: 'SOLD', reservedUntil: null, reservationCustomer: null, reservedById: null } })
            if (unit.status === 'AVAILABLE') await changeStock(tx, { tenantId: tenant, productId: item.productId, delta: -1, message: 'El stock cambió mientras se entregaba el equipo.' })
          } else {
            // Sobre pedido entregado: la unidad no existía en stock; se crea
            // directamente como vendida, sin mover existencias.
            await tx.inventoryUnit.create({ data: { tenantId: tenant, productId: item.productId, branchId: existing.branchId, serial, condition: 'NEW', status: 'SOLD' } })
          }
        }
        const saved = await tx.orderItem.update({ where: { id: item.id }, data: { serials: [...(Array.isArray(item.serials) ? item.serials : []), ...serials], serialsPending: { decrement: serials.length } } })
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'ORDER_SERIALS_ATTACHED', entity: 'Order', entityId: existing.id, metadata: { itemId, serials } } })
        return saved
      })
      const order = await prisma.order.findFirstOrThrow({ where: { id: orderId, tenantId: tenant }, include: orderInclude })
      return json(order)
    }

    // ── Etiquetas del pedido ──
    if (body.tags !== undefined) {
      if (!Array.isArray(body.tags) || body.tags.length > 20 || body.tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.trim().length > 40)) throw new InputError('Las etiquetas son hasta 20 textos de 40 caracteres.')
      const tags = [...new Set(body.tags.map(tag => tag.trim()))]
      const order = await prisma.$transaction(async tx => {
        const updated = await tx.order.update({ where: { id: existing.id }, data: { tags }, include: orderInclude })
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'ORDER_TAGS_UPDATED', entity: 'Order', entityId: existing.id, metadata: { tags } } })
        return updated
      })
      return json(order)
    }

    // ── Factura a otro titular y comentario ──
    if (body.billingName !== undefined || body.billingDocument !== undefined || body.notes !== undefined) {
      const billingName = body.billingName === undefined ? undefined : textInput(body.billingName, 'Titular de factura', 200)
      const billingDocument = body.billingDocument === undefined ? undefined : textInput(body.billingDocument, 'RUC de factura', 100)
      const notes = body.notes === undefined ? undefined : textInput(body.notes, 'Comentario', 2000)
      if (billingName === undefined && billingDocument === undefined && notes === undefined) throw new InputError('Datos de factura inválidos.')
      const order = await prisma.$transaction(async tx => {
        const updated = await tx.order.update({ where: { id: existing.id }, data: { ...(billingName === undefined ? {} : { billingName }), ...(billingDocument === undefined ? {} : { billingDocument }), ...(notes === undefined ? {} : { notes }) }, include: orderInclude })
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'ORDER_BILLING_UPDATED', entity: 'Order', entityId: existing.id, metadata: { billingName: updated.billingName, hasDocument: Boolean(updated.billingDocument) } } })
        return updated
      })
      return json(order)
    }

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
