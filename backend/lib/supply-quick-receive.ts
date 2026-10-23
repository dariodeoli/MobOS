// Venta sin stock · «Recibido» rápido y llegada de lo vendido sobre pedido.
//
// Un producto sin serial se recibe con un toque y una cantidad: baja
// `stockPending` de la línea vendida (con tope en 0) y deja el kardex con una
// entrada y una salida que suman cero (la unidad llega y sale hacia el cliente
// que ya la compró; el contador de stock no se mueve). Con IMEI se usa la
// recepción del lote. Nada se envía solo: el aviso al cliente lo manda el
// encargado.
import type { Prisma } from '@prisma/client'

type Tx = Prisma.TransactionClient

export class RecepcionRapidaError extends Error {
  constructor(message: string, public status = 409) { super(message) }
}

export type PlanRecepcionRapida = { aplicar: number; tope: number; porRecibir: number }

/**
 * Cuánto se puede recibir de una vez: lo pedido, con tope en lo que la línea
 * sigue esperando (`stockPending`) y en lo comprado que todavía no llegó.
 */
export function planRecepcionRapida({ cantidad, stockPending, serialsPending = 0, comprada, recibida }: { cantidad: unknown; stockPending: number; serialsPending?: number; comprada: number; recibida: number }): PlanRecepcionRapida {
  const pedida = Math.round(Number(cantidad))
  if (!Number.isFinite(pedida) || pedida < 1) throw new RecepcionRapidaError('Indicá cuántas unidades llegaron (1 o más).', 400)
  if (serialsPending > 0 && stockPending <= 0) throw new RecepcionRapidaError('Este equipo lleva IMEI: recibilo con la recepción del lote.', 409)
  if (stockPending <= 0) throw new RecepcionRapidaError('Esa venta ya no tiene unidades pendientes de llegar.', 409)
  const porRecibir = Math.max(0, Math.round(comprada) - Math.round(recibida))
  if (porRecibir <= 0) throw new RecepcionRapidaError('Primero registrá la compra de este producto.', 409)
  const tope = Math.min(stockPending, porRecibir)
  return { aplicar: Math.min(pedida, tope), tope, porRecibir }
}

/** Unidades compradas (con compra vigente) para una necesidad. */
export async function unidadesCompradas(tx: Tx, tenantId: string, needId: string): Promise<number> {
  const lineas = await tx.supplyPurchaseLine.findMany({ where: { tenantId, needId, purchase: { is: { status: { not: 'CANCELADA' } } } }, select: { quantity: true, coveredQuantity: true } })
  return lineas.reduce((suma, linea) => suma + (linea.coveredQuantity ?? linea.quantity), 0)
}

export async function recibirRapido(tx: Tx, { tenantId, userId, needId, quantity }: { tenantId: string; userId: string; needId: string; quantity: unknown }) {
  const need = await tx.supplyNeed.findFirst({ where: { id: needId, tenantId }, select: { id: true, status: true, quantity: true, receivedQty: true, productId: true, orderId: true, orderItemId: true } })
  if (!need) throw new RecepcionRapidaError('Necesidad no encontrada.', 404)
  if (!need.orderItemId || !need.orderId) throw new RecepcionRapidaError('Esta necesidad no viene de una venta: se recibe con la recepción del lote.', 409)
  if (need.status === 'CANCELADA') throw new RecepcionRapidaError('La necesidad está cancelada.', 409)
  const item = await tx.orderItem.findFirst({ where: { id: need.orderItemId, order: { tenantId } }, select: { id: true, stockPending: true, serialsPending: true, productId: true } })
  if (!item) throw new RecepcionRapidaError('Línea de la venta no encontrada.', 404)
  const comprada = await unidadesCompradas(tx, tenantId, need.id)
  const plan = planRecepcionRapida({ cantidad: quantity, stockPending: item.stockPending, serialsPending: item.serialsPending, comprada, recibida: need.receivedQty })
  // Atómico: dos toques seguidos no bajan dos veces la misma unidad.
  const bajo = await tx.orderItem.updateMany({ where: { id: item.id, stockPending: { gte: plan.aplicar } }, data: { stockPending: { decrement: plan.aplicar } } })
  if (bajo.count !== 1) throw new RecepcionRapidaError('La línea cambió mientras se recibía. Actualizá e intentá de nuevo.', 409)
  const ahora = new Date()
  const quedan = item.stockPending - plan.aplicar
  if (quedan === 0 && item.serialsPending === 0) await tx.orderItem.update({ where: { id: item.id }, data: { backorderArrivedAt: ahora } })
  const recibida = need.receivedQty + plan.aplicar
  const llegoTodo = need.quantity === 0 && recibida >= comprada
  await tx.supplyNeed.update({ where: { id: need.id }, data: { receivedQty: recibida, ...(llegoTodo ? { status: 'RECIBIDA', arrivedAt: ahora } : {}) } })
  // Kardex: entrada (+) y salida (−) del mismo momento, neto cero (el contador de stock no cambia).
  await tx.auditLog.create({ data: { tenantId, userId, action: 'SUPPLY_QUICK_RECEIVED', entity: 'Order', entityId: need.orderId, metadata: { itemId: item.id, needId: need.id, productId: need.productId, quantity: plan.aplicar, pedidas: Math.round(Number(quantity)), restantes: quedan, llegoTodo } } })
  return { aplicadas: plan.aplicar, restantes: quedan, llegoTodo, needId: need.id, orderId: need.orderId, itemId: item.id }
}

/**
 * La confirmación de un lote recibió unidades de estas líneas de compra: si una
 * necesidad quedó cubierta por completo, pasa a RECIBIDA y la línea vendida
 * queda «Llegó» (el IMEI se asigna al entregar).
 */
export async function marcarLlegadaDeLineas(tx: Tx, { tenantId, userId, lineIds }: { tenantId: string; userId: string | null; lineIds: string[] }) {
  const lineas = await tx.supplyPurchaseLine.findMany({ where: { id: { in: [...new Set(lineIds)] }, tenantId, needId: { not: null } }, select: { id: true, needId: true } })
  const needIds = [...new Set(lineas.map((linea) => linea.needId).filter((id): id is string => Boolean(id)))]
  let completadas = 0
  for (const needId of needIds) {
    const need = await tx.supplyNeed.findFirst({ where: { id: needId, tenantId }, select: { id: true, status: true, quantity: true, receivedQty: true, orderId: true, orderItemId: true } })
    if (!need || need.status === 'CANCELADA' || need.status === 'RECIBIDA') continue
    const comprada = await unidadesCompradas(tx, tenantId, needId)
    const lineasDeNecesidad = await tx.supplyPurchaseLine.findMany({ where: { tenantId, needId, purchase: { is: { status: { not: 'CANCELADA' } } } }, select: { id: true } })
    const recibidas = await tx.supplyShipmentItem.count({ where: { tenantId, lineId: { in: lineasDeNecesidad.map((linea) => linea.id) }, status: 'RECIBIDO' } })
    const receivedQty = Math.max(need.receivedQty, recibidas)
    const llegoTodo = need.quantity === 0 && comprada > 0 && receivedQty >= comprada
    await tx.supplyNeed.update({ where: { id: needId }, data: { receivedQty, ...(llegoTodo ? { status: 'RECIBIDA', arrivedAt: new Date() } : {}) } })
    if (llegoTodo && need.orderItemId) {
      await tx.orderItem.updateMany({ where: { id: need.orderItemId, order: { tenantId }, backorderArrivedAt: null }, data: { backorderArrivedAt: new Date() } })
      await tx.auditLog.create({ data: { tenantId, userId, action: 'SUPPLY_NEED_ARRIVED', entity: 'SupplyNeed', entityId: needId, metadata: { orderId: need.orderId, itemId: need.orderItemId, unidades: receivedQty } } })
      completadas += 1
    }
  }
  return { completadas }
}
