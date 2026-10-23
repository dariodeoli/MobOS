// Venta sin stock · el costo de la compra llega a la venta original.
//
// Una línea vendida sin stock nace con `costPending` (no se sabía el costo). Cuando
// la compra de Por comprar tiene costo, ese costo se imputa a la línea de la venta
// original: el margen se calcula en la FECHA DE LA VENTA (los reportes leen solo
// `OrderItem.unitCostPyg`). Reglas:
//   · idempotente: el costo sale de una función de las líneas de compra vigentes,
//     así repetir la propagación no cambia nada (ni duplica auditoría);
//   · compra parcial: promedio ponderado de las unidades ya compradas con costo;
//   · `costSource = PURCHASE`: un IMEI cargado después no lo pisa (si el costo del
//     IMEI es distinto, se audita la diferencia);
//   · cancelar la compra recalcula con las compras que quedan y, si no queda
//     ninguna, devuelve la línea a `costPending` solo si su costo era de compra.
import type { Prisma } from '@prisma/client'
import { numeroOpcional } from './montos'

type Tx = Prisma.TransactionClient

export type UnidadesConCosto = { unidades: number; unitCostPyg: number }

/** Promedio ponderado (redondeado a Gs enteros) de las unidades compradas con costo; null si no hay. */
export function costoPonderado(lineas: UnidadesConCosto[]): number | null {
  let unidades = 0
  let total = 0
  for (const linea of lineas) {
    const cantidad = Math.max(0, Math.round(Number(linea.unidades) || 0))
    const costo = Number(linea.unitCostPyg)
    if (!cantidad || !Number.isFinite(costo) || costo < 0) continue
    unidades += cantidad
    total += cantidad * costo
  }
  return unidades > 0 ? Math.round(total / unidades) : null
}

export type DecisionDeCosto =
  | { accion: 'omitir' }
  | { accion: 'sin_cambio' }
  | { accion: 'imputar'; costoUnitario: number }
  | { accion: 'revertir' }

/** Decide qué hacer con el costo de una línea vendida sin stock (puro). */
export function decidirCostoDeLinea({ costPending, costSource, unitCostPyg, baseUnitCostPyg, costoCompra }: { costPending: boolean; costSource: string | null; unitCostPyg: number | null; baseUnitCostPyg: number | null; costoCompra: number | null }): DecisionDeCosto {
  const esDeCompra = costSource === 'PURCHASE'
  // Un costo que ya vino de otra fuente (producto, IMEI, manual) no se toca.
  if (!costPending && !esDeCompra) return { accion: 'omitir' }
  if (costoCompra === null) return esDeCompra ? { accion: 'revertir' } : { accion: 'omitir' }
  if (esDeCompra && !costPending && baseUnitCostPyg === costoCompra && unitCostPyg !== null) return { accion: 'sin_cambio' }
  return { accion: 'imputar', costoUnitario: costoCompra }
}

async function recalcularLinea(tx: Tx, { tenantId, userId, orderItemId, purchaseId }: { tenantId: string; userId: string | null; orderItemId: string; purchaseId: string }): Promise<DecisionDeCosto['accion']> {
  const item = await tx.orderItem.findFirst({
    where: { id: orderItemId, order: { tenantId } },
    select: { id: true, orderId: true, costPending: true, costSource: true, unitCostPyg: true, baseUnitCostPyg: true, insurancePyg: true, extraCostPyg: true },
  })
  if (!item) return 'omitir'
  const lineas = await tx.supplyPurchaseLine.findMany({
    where: { tenantId, need: { is: { orderItemId } }, purchase: { is: { status: { not: 'CANCELADA' } } } },
    select: { quantity: true, coveredQuantity: true, unitCostPyg: true, purchase: { select: { costPyg: true, lines: { select: { quantity: true } } } } },
  })
  // Costo por unidad de cada línea: el suyo o, si la factura trae solo el total, el
  // total repartido entre las unidades de la compra (igual que la recepción).
  const costoCompra = costoPonderado(lineas.map((linea) => {
    const propio = numeroOpcional(linea.unitCostPyg)
    const total = numeroOpcional(linea.purchase.costPyg)
    const unidadesCompra = linea.purchase.lines.reduce((suma, fila) => suma + fila.quantity, 0)
    const unitCostPyg = propio ?? (total !== null && unidadesCompra > 0 ? Math.round(total / unidadesCompra) : Number.NaN)
    return { unidades: linea.coveredQuantity ?? linea.quantity, unitCostPyg }
  }))
  const decision = decidirCostoDeLinea({
    costPending: item.costPending,
    costSource: item.costSource,
    unitCostPyg: numeroOpcional(item.unitCostPyg),
    baseUnitCostPyg: numeroOpcional(item.baseUnitCostPyg),
    costoCompra,
  })
  if (decision.accion === 'imputar') {
    const adicionales = (numeroOpcional(item.insurancePyg) ?? 0) + (numeroOpcional(item.extraCostPyg) ?? 0)
    await tx.orderItem.update({
      where: { id: item.id },
      data: { baseUnitCostPyg: BigInt(decision.costoUnitario), unitCostPyg: BigInt(decision.costoUnitario + adicionales), costPending: false, costSource: 'PURCHASE' },
    })
    await tx.auditLog.create({ data: { tenantId, userId, action: 'ORDER_ITEM_COST_FROM_PURCHASE', entity: 'Order', entityId: item.orderId, metadata: { itemId: item.id, purchaseId, costoUnitarioPyg: decision.costoUnitario, anteriorPyg: numeroOpcional(item.baseUnitCostPyg), costPendingAntes: item.costPending } } })
  } else if (decision.accion === 'revertir') {
    await tx.orderItem.update({ where: { id: item.id }, data: { baseUnitCostPyg: null, unitCostPyg: null, costPending: true, costSource: null } })
    await tx.auditLog.create({ data: { tenantId, userId, action: 'ORDER_ITEM_COST_REVERTED', entity: 'Order', entityId: item.orderId, metadata: { itemId: item.id, purchaseId } } })
  }
  return decision.accion
}

/**
 * Imputa el costo de la compra a las ventas originales que cubre (por necesidad →
 * línea de pedido). Devuelve cuántas líneas cambiaron. Idempotente.
 */
export async function propagarCostoAVentas(tx: Tx, purchaseId: string, { tenantId, userId = null }: { tenantId: string; userId?: string | null }): Promise<{ imputadas: number; revertidas: number }> {
  const lineas = await tx.supplyPurchaseLine.findMany({ where: { purchaseId, tenantId, needId: { not: null } }, select: { needId: true } })
  const needIds = [...new Set(lineas.map((linea) => linea.needId).filter((id): id is string => Boolean(id)))]
  if (!needIds.length) return { imputadas: 0, revertidas: 0 }
  const necesidades = await tx.supplyNeed.findMany({ where: { id: { in: needIds }, tenantId, orderItemId: { not: null } }, select: { orderItemId: true } })
  const items = [...new Set(necesidades.map((necesidad) => necesidad.orderItemId).filter((id): id is string => Boolean(id)))]
  let imputadas = 0
  let revertidas = 0
  for (const orderItemId of items) {
    const accion = await recalcularLinea(tx, { tenantId, userId, orderItemId, purchaseId })
    if (accion === 'imputar') imputadas += 1
    if (accion === 'revertir') revertidas += 1
  }
  return { imputadas, revertidas }
}

/** Al cancelar una compra: recalcula con las que quedan (la cancelada ya no cuenta). */
export const revertirCostoDeVentas = propagarCostoAVentas

export type CostoDeSerial = { costSource: string | null; costPending: boolean; baseUnitCostPyg: number | null }

/**
 * Un IMEI entregado después trae su costo: si la línea ya tiene costo de compra
 * no se pisa (solo se audita la diferencia); si estaba pendiente, el IMEI lo
 * completa con `costSource = SERIAL`.
 */
export function costoAlAsignarSerial({ linea, costoSerial }: { linea: CostoDeSerial; costoSerial: number | null }): { accion: 'completar' | 'conservar' | 'auditar_diferencia' | 'nada'; costSource?: string } {
  if (costoSerial === null) return { accion: 'nada' }
  if (linea.costSource === 'PURCHASE') return linea.baseUnitCostPyg !== null && linea.baseUnitCostPyg !== costoSerial ? { accion: 'auditar_diferencia' } : { accion: 'conservar' }
  if (linea.costPending) return { accion: 'completar', costSource: 'SERIAL' }
  return { accion: 'nada' }
}
