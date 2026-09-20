import { InputError, textInput } from './payment-input'
import { serialKey } from './validation'

// Devoluciones, cambios y cancelaciones de una venta. Concentra el parseo del
// pedido de postventa y el cálculo del reembolso y de la reposición de stock
// para poder probarlos con bordes (reembolso parcial, unidades serializadas con
// decisión por equipo, nota de crédito) sin duplicar reglas en la ruta.
//
// La reposición es una decisión explícita del mostrador, por unidad cuando hay
// seriales: cada equipo vuelve a la venta (AVAILABLE) o queda en revisión
// (DEFECTIVE). El reembolso puede salir en efectivo/cuenta o quedar como saldo
// a favor del cliente (nota de crédito interna).

export const RETURN_OPERATIONS = ['RETURN', 'EXCHANGE', 'CANCEL'] as const
export const RETURN_REFUND_MODES = ['CASH', 'CREDIT'] as const
export const RESTOCK_OPTIONS = ['NONE', 'AVAILABLE', 'REVIEW'] as const
export type ReturnOperation = typeof RETURN_OPERATIONS[number]
export type RefundMode = typeof RETURN_REFUND_MODES[number]
export type RestockOption = typeof RESTOCK_OPTIONS[number]
export type RestockDecision = 'AVAILABLE' | 'REVIEW'

export type UnitRestockDecision = { serial: string; decision: RestockDecision }
export type ReturnRequestData = {
  operation: ReturnOperation
  reason: string
  refundPyg: number | undefined
  replacementOrderId: string | undefined
  replacementOrderNumber: string | undefined
  refundMode: RefundMode
  restock: RestockOption
  restockUnits: UnitRestockDecision[]
}

const DECISION_STATUS: Record<RestockDecision, 'AVAILABLE' | 'DEFECTIVE'> = { AVAILABLE: 'AVAILABLE', REVIEW: 'DEFECTIVE' }

// Decisiones por unidad (serial) que sobrescriben la decisión general. Solo
// aplican a equipos serializados: un serial que no está en la venta es un error
// del cliente, no un dato a ignorar.
export function parseRestockUnits(value: unknown): UnitRestockDecision[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > 500) throw new InputError('Las decisiones de reposición por unidad son inválidas.')
  const decisions = value.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new InputError('Cada reposición por unidad debe indicar serial y estado.')
    const input = row as Record<string, unknown>
    // Misma clave que usa el inventario (sin separadores, en mayúsculas) para
    // que el mostrador pueda escribir el IMEI como lo ve impreso.
    const serial = serialKey(textInput(input.serial, 'Serie', 100))
    if (!serial) throw new InputError('La serie de la reposición es inválida.')
    const decision = textInput(input.decision ?? input.status, 'Estado de reposición', 10).toUpperCase()
    if (decision !== 'AVAILABLE' && decision !== 'REVIEW') throw new InputError('El estado por unidad debe ser AVAILABLE (apto) o REVIEW (revisión).')
    return { serial, decision: decision as RestockDecision }
  })
  if (new Set(decisions.map(item => item.serial)).size !== decisions.length) throw new InputError('Una serie no puede repetirse en la reposición.')
  return decisions
}

export function returnRequest(input: Record<string, unknown>): ReturnRequestData {
  if (Object.keys(input).some(key => !['operation', 'reason', 'refundPyg', 'replacementOrderId', 'replacementOrderNumber', 'refundMode', 'restock', 'restockUnits'].includes(key))) throw new InputError('La devolución contiene campos no admitidos.')
  const operation = textInput(input.operation, 'Operación', 20).toUpperCase() as ReturnOperation
  if (!RETURN_OPERATIONS.includes(operation)) throw new InputError('Operación de postventa inválida.')
  const reason = textInput(input.reason, 'Motivo', 1000)
  if (reason.length < 3) throw new InputError('Indicá un motivo de al menos 3 caracteres.')
  const refundPyg = input.refundPyg === undefined ? undefined : Number(input.refundPyg)
  if (refundPyg !== undefined && (!Number.isSafeInteger(refundPyg) || refundPyg < 0)) throw new InputError('Monto de devolución inválido.')
  const replacementOrderId = input.replacementOrderId === undefined ? undefined : textInput(input.replacementOrderId, 'Pedido de cambio', 200)
  const replacementOrderNumber = input.replacementOrderNumber === undefined ? undefined : textInput(input.replacementOrderNumber, 'Número de pedido de cambio', 200)
  if (operation === 'EXCHANGE' && !replacementOrderId && !replacementOrderNumber) throw new InputError('Indicá el pedido que reemplaza esta venta.')
  // Cómo se devuelve el dinero: en efectivo/cuenta (comportamiento histórico) o
  // como saldo a favor del cliente (nota de crédito interna reutilizable).
  const refundMode = (input.refundMode === undefined || input.refundMode === null || input.refundMode === '' ? 'CASH' : textInput(input.refundMode, 'Modo de reembolso', 10).toUpperCase()) as RefundMode
  if (!RETURN_REFUND_MODES.includes(refundMode)) throw new InputError('Modo de reembolso inválido.')
  // Qué hacer con el stock devuelto: nada (revisión aparte), volver a la venta
  // o dejarlo marcado como defectuoso para revisión. `restockUnits` permite
  // decidir distinto por cada equipo serializado.
  const restock = (input.restock === undefined || input.restock === null || input.restock === '' ? 'NONE' : textInput(input.restock, 'Reposición', 10).toUpperCase()) as RestockOption
  if (!RESTOCK_OPTIONS.includes(restock)) throw new InputError('Reposición de stock inválida.')
  const restockUnits = parseRestockUnits(input.restockUnits)
  if (operation === 'EXCHANGE' && refundMode === 'CREDIT') throw new InputError('Un cambio no genera saldo a favor.')
  return { operation, reason, refundPyg, replacementOrderId, replacementOrderNumber, refundMode, restock, restockUnits }
}

// Reembolso efectivo: por defecto, todo lo cobrado (un cambio no devuelve
// dinero); parcial permitido entre 0 y lo confirmado.
export function resolveRefundPyg(input: { operation: ReturnOperation; confirmedPyg: number; requestedPyg: number | undefined }): number {
  if (input.operation === 'EXCHANGE') return 0
  const refundPyg = input.requestedPyg ?? input.confirmedPyg
  if (refundPyg > input.confirmedPyg) throw new InputError('El reembolso no puede superar el total cobrado.', 409)
  return refundPyg
}

export type RestockPlan = {
  /** Seriales que vuelven a estar disponibles para la venta. */
  available: Array<{ productId: string; serial: string }>
  /** Seriales que quedan en revisión (defectuoso). */
  review: Array<{ productId: string; serial: string }>
  /** Decisión general aplicada a los ítems sin seriales. */
  fallback: RestockOption
}

// Plan de reposición: cada serial de la venta termina en disponible o en
// revisión según su decisión propia o, si no la tiene, la decisión general del
// mostrador. La ruta aplica el plan dentro de la transacción.
export function planReposicion(input: {
  restock: RestockOption
  units: UnitRestockDecision[]
  items: Array<{ productId: string | null; serials: string[] }>
}): RestockPlan {
  const bySerial = new Map<string, RestockDecision>()
  for (const unit of input.units) bySerial.set(serialKey(unit.serial), unit.decision)
  const enVenta = new Set<string>()
  for (const item of input.items) {
    if (!item.productId) continue
    for (const serial of item.serials) enVenta.add(serialKey(serial))
  }
  const fuera = input.units.filter(unit => !enVenta.has(serialKey(unit.serial)))
  if (fuera.length) throw new InputError(`Estas series no pertenecen a la venta: ${fuera.map(unit => unit.serial).join(', ')}.`, 409)
  const available: RestockPlan['available'] = []
  const review: RestockPlan['review'] = []
  for (const item of input.items) {
    if (!item.productId) continue
    for (const serial of item.serials) {
      const decision = bySerial.get(serialKey(serial)) ?? (input.restock === 'NONE' ? null : input.restock)
      if (decision === 'AVAILABLE') available.push({ productId: item.productId, serial: serialKey(serial) })
      else if (decision === 'REVIEW') review.push({ productId: item.productId, serial: serialKey(serial) })
    }
  }
  return { available, review, fallback: input.restock }
}

// Estado de inventario de una decisión (AVAILABLE vuelve a la venta,
// REVIEW queda defectuoso para revisión).
export const inventoryStatusFor = (decision: RestockDecision) => DECISION_STATUS[decision]
