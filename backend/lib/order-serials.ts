import type { Prisma, ProductCondition } from '@prisma/client'
import { InputError } from './payment-input'
import { changeStock, linkSoldUnits, promoteToEquipo } from './stock'

// Espejo indexado de OrderItem.serials (ver modelo OrderItemSerial). El JSON
// sigue siendo el dato que muestra el comprobante; esta tabla existe para
// responder "¿qué venta tiene este IMEI/serial?" con índice. Se sincroniza en
// cada escritura de la línea: es idempotente y tolera valores no textuales.
export async function syncOrderItemSerials(tx: Prisma.TransactionClient, items: Array<{ id: string; serials: unknown }>) {
  for (const item of items) {
    const serials = Array.isArray(item.serials)
      ? [...new Set((item.serials as unknown[]).filter((serial): serial is string => typeof serial === 'string' && serial.trim().length > 0).map((serial) => serial.trim()))]
      : []
    await tx.orderItemSerial.deleteMany({ where: { orderItemId: item.id } })
    if (serials.length) await tx.orderItemSerial.createMany({ data: serials.map((serial) => ({ orderItemId: item.id, serial })), skipDuplicates: true })
  }
}

export type AttachSerialsInput = {
  tenantId: string
  orderId: string
  orderItemId: string
  serials: string[]
  userId: string
  // Solo para unidades que no existían en stock (venta sobre pedido): sin
  // estos datos la unidad nace NEW y sin costo ni proveedor, como siempre.
  condition?: ProductCondition
  costPyg?: number | bigint | null
  supplierId?: string | null
}

// Entregar equipos sobre pedido: agrega IMEI/seriales a una línea con
// serialsPending. Las unidades que ya estaban en stock pasan a SOLD (y
// descuentan el contador solo si estaban AVAILABLE); las que no existían se
// crean directamente vendidas, sin mover existencias. Si se informa costo y la
// línea tenía el costo pendiente, se completa. Corre dentro de la transacción
// del llamador y valida contra la empresa (tenantId).
export async function attachSerialsToOrderItem(tx: Prisma.TransactionClient, input: AttachSerialsInput) {
  const { tenantId: tenant, userId, orderId, orderItemId: itemId, serials } = input
  const order = await tx.order.findFirst({ where: { id: orderId, tenantId: tenant }, include: { items: true } })
  if (!order) throw new InputError('Pedido no encontrado.', 404)
  const item = order.items.find(row => row.id === itemId)
  if (!item) throw new InputError('Línea no encontrada en el pedido.')
  if (item.serialsPending < serials.length) throw new InputError(`La línea solo espera ${item.serialsPending} IMEI/serial(es) pendiente(s).`)
  const existingSerials = new Set(order.items.flatMap(row => (Array.isArray(row.serials) ? row.serials : [])))
  if (serials.some(serial => existingSerials.has(serial))) throw new InputError('Ese IMEI/serial ya está en el pedido.')
  if (input.supplierId && !(await tx.supplier.findFirst({ where: { id: input.supplierId, tenantId: tenant }, select: { id: true } }))) throw new InputError('Proveedor no encontrado.', 404)
  const cost = input.costPyg === undefined || input.costPyg === null ? null : BigInt(input.costPyg)
  if (cost !== null && cost < BigInt(0)) throw new InputError('El costo no puede ser negativo.')
  for (const serial of serials) {
    if (!item.productId) continue
    const unit = await tx.inventoryUnit.findFirst({ where: { tenantId: tenant, serial, productId: item.productId } })
    if (unit) {
      if (!['AVAILABLE', 'RESERVED'].includes(unit.status)) throw new InputError(`El IMEI ${serial} no está disponible para esta entrega.`, 409)
      await tx.inventoryUnit.update({ where: { id: unit.id }, data: { status: 'SOLD', reservedUntil: null, reservationCustomer: null, reservationCustomerId: null, reservedById: null, reservationKind: null, holdCartId: null, holdDeviceId: null, holdStartedAt: null } })
      if (unit.status === 'AVAILABLE') await changeStock(tx, { tenantId: tenant, productId: item.productId, delta: -1, message: 'El stock cambió mientras se entregaba el equipo.' })
    } else {
      // Sobre pedido entregado: la unidad no existía en stock; se crea
      // directamente como vendida, sin mover existencias.
      await tx.inventoryUnit.create({ data: { tenantId: tenant, productId: item.productId, branchId: order.branchId, serial, condition: input.condition ?? 'NEW', status: 'SOLD', ...(cost !== null ? { costPyg: cost } : {}), ...(input.supplierId ? { supplierId: input.supplierId } : {}) } })
      await promoteToEquipo(tx, tenant, item.productId)
    }
  }
  // Con costo informado se completa el de la línea que se vendió sin saberlo.
  const completaCosto = cost !== null && item.costPending
  const saved = await tx.orderItem.update({ where: { id: item.id }, data: { serials: [...(Array.isArray(item.serials) ? item.serials : []), ...serials], serialsPending: { decrement: serials.length }, ...(completaCosto ? { costPending: false, baseUnitCostPyg: cost, unitCostPyg: cost } : {}) } })
  await tx.auditLog.create({ data: { tenantId: tenant, userId, action: 'ORDER_SERIALS_ATTACHED', entity: 'Order', entityId: order.id, metadata: { itemId, serials } } })
  await syncOrderItemSerials(tx, [saved])
  await linkSoldUnits(tx, tenant, [{ id: saved.id, serials }])
  return saved
}
