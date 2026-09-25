// Cuenta a pagar al proveedor por repuestos/insumos (#250 · #83). Puro y
// compartido por la API de finanzas y sus tests: cuánto de una compra impacta
// como «por pagar» según su condición y cómo se clasifica su vencimiento.

export const SUPPLIER_PAYABLE_CONDITIONS = ['CONTADO', 'CREDITO', 'CONSIGNACION'] as const
export type SupplierPayableCondition = (typeof SUPPLIER_PAYABLE_CONDITIONS)[number]

export const CONDICION_PROVEEDOR_LABELS: Record<SupplierPayableCondition, string> = {
  CONTADO: 'Contado',
  CREDITO: 'Crédito',
  CONSIGNACION: 'En consignación',
}

export class SupplierPayableInputError extends Error {}

const INT_MAX = 2147483647

function monto(value: unknown, field: string) {
  const numero = Number(value)
  if (typeof value === 'boolean' || value === null || value === undefined || value === '' || !Number.isSafeInteger(numero) || numero < 0 || numero > INT_MAX) {
    throw new SupplierPayableInputError(`${field} inválido.`)
  }
  return numero
}

export type DatosDeCompra = {
  condition: SupplierPayableCondition
  amountPyg: number
  consumedPyg?: number
  paidPyg?: number
  dueAt?: Date | string | null
}

/**
 * Lo que la compra suma a la cuenta a pagar:
 * - CONTADO: 0 (se paga al recibir).
 * - CREDITO: el total comprado.
 * - CONSIGNACION: solo lo consumido; el resto es tenencia del proveedor y no
 *   impacta en Finanzas hasta que el taller lo usa.
 */
export function payableDeCompra({ condition, amountPyg, consumedPyg = 0 }: DatosDeCompra) {
  const total = monto(amountPyg, 'Monto')
  if (condition === 'CONTADO') return 0
  const consumido = Math.min(total, monto(consumedPyg, 'Consumo'))
  return condition === 'CONSIGNACION' ? consumido : total
}

/** Pendiente de pago: lo pagable menos lo ya pagado (nunca negativo). */
export function pendienteDeCompra(datos: DatosDeCompra) {
  return Math.max(0, payableDeCompra(datos) - monto(datos.paidPyg ?? 0, 'Pagado'))
}

/** Tenencia del proveedor: mercadería en depósito que todavía no se paga. */
export function enDepositoDeCompra({ condition, amountPyg, consumedPyg = 0 }: DatosDeCompra) {
  if (condition !== 'CONSIGNACION') return 0
  const total = monto(amountPyg, 'Monto')
  return Math.max(0, total - Math.min(total, monto(consumedPyg, 'Consumo')))
}

export type EstadoVencimiento = 'SIN_VENCIMIENTO' | 'AL_DIA' | 'POR_VENCER' | 'VENCIDA'

/** Vencimiento para la lista: «por vencer» son los próximos 7 días. */
export function estadoDeVencimiento(dueAt: Date | string | null | undefined, ahora: Date = new Date()): EstadoVencimiento {
  if (!dueAt) return 'SIN_VENCIMIENTO'
  const fecha = dueAt instanceof Date ? dueAt : new Date(dueAt)
  if (!Number.isFinite(fecha.getTime())) throw new SupplierPayableInputError('Vencimiento inválido.')
  const dias = Math.floor((fecha.getTime() - ahora.getTime()) / 86400000)
  if (dias < 0) return 'VENCIDA'
  if (dias <= 7) return 'POR_VENCER'
  return 'AL_DIA'
}

/** Resumen para el KPI: a pagar (crédito + consumo), vencidas, por vencer y
 *  tenencia en consignación (sin impacto hasta el consumo). */
export function resumenProveedores(compras: DatosDeCompra[], ahora: Date = new Date()) {
  let totalPyg = 0
  let vencidasPyg = 0
  let porVencerPyg = 0
  let depositoPyg = 0
  for (const compra of compras) {
    const pendiente = pendienteDeCompra(compra)
    totalPyg += pendiente
    const estado = estadoDeVencimiento(compra.dueAt, ahora)
    if (estado === 'VENCIDA') vencidasPyg += pendiente
    else if (estado === 'POR_VENCER') porVencerPyg += pendiente
    depositoPyg += enDepositoDeCompra(compra)
  }
  return { totalPyg, vencidasPyg, porVencerPyg, depositoPyg }
}
