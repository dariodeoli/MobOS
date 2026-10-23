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

import type { Prisma } from '@prisma/client'
import { LIMITE_MONTO_GENERAL } from './montos'
import { createCashMovement } from './cash-movements'

export class SupplierPayableInputError extends Error {}

function monto(value: unknown, field: string) {
  const numero = Number(value)
  if (typeof value === 'boolean' || value === null || value === undefined || value === '' || !Number.isSafeInteger(numero) || numero < 0 || numero > LIMITE_MONTO_GENERAL) {
    throw new SupplierPayableInputError(`${field} inválido.`)
  }
  return numero
}

export type DatosDeCompra = {
  condition: SupplierPayableCondition
  amountPyg: bigint | number
  consumedPyg?: bigint | number
  paidPyg?: bigint | number
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

/** Finanzas (cuentas de caja/banco): quien tiene `cash:manage` (ADMIN y gerencia). */
export function puedeFinanzas(permisos: readonly string[] | null | undefined): boolean {
  return Array.isArray(permisos) && (permisos.includes('*') || permisos.includes('cash:manage'))
}

/** Saldo de una cuenta a pagar sin la regla de contado (contado/crédito por igual). */
export function saldoDeCuenta({ amountPyg, paidPyg = 0 }: { amountPyg: bigint | number; paidPyg?: bigint | number }) {
  return Math.max(0, monto(amountPyg, 'Monto') - monto(paidPyg, 'Pagado'))
}

export type PagoAProveedor = {
  tenantId: string
  userId: string
  payableId: string
  /** Sucursal a la que se acota la búsqueda (null = toda la empresa). */
  branchId?: string | null
  /** Monto a pagar; null = todo el saldo. */
  amountPyg?: number | null
  /** Cuenta de caja/banco: con ella se registra la salida de plata. */
  accountId?: string | null
  /** Saldo que se considera pagable (por defecto, el de `pendienteDeCompra`). */
  saldoPagable?: (cuenta: { amountPyg: bigint | number; paidPyg: bigint | number; condition: SupplierPayableCondition; consumedPyg: bigint | number }) => number
  /** Evita duplicar la salida en un reintento (único por empresa). */
  idempotencyKey?: string | null
  descripcion?: string
  auditExtra?: Record<string, unknown>
}

/**
 * Registra un pago a proveedor dentro de la transacción del llamador: suma al
 * pagado y, con cuenta, deja la salida de caja/banco (`CashMovement` OUT).
 * Extraído de `supplierPayment` de Finanzas para compartirlo con «Marcar
 * pagado» de Por comprar.
 */
export async function registrarPagoAProveedor(tx: Prisma.TransactionClient, pago: PagoAProveedor) {
  const compra = await tx.supplierPayable.findFirst({ where: { id: pago.payableId, tenantId: pago.tenantId, ...(pago.branchId ? { branchId: pago.branchId } : {}) } })
  if (!compra) throw new SupplierPayableInputError('La compra no existe.')
  const pendiente = (pago.saldoPagable ?? pendienteDeCompra)(compra as never)
  const aPagar = pago.amountPyg === null || pago.amountPyg === undefined ? pendiente : Number(pago.amountPyg)
  if (!Number.isSafeInteger(aPagar) || aPagar < 1 || aPagar > pendiente) {
    throw new SupplierPayableInputError(pendiente > 0 ? `El pago tiene que estar entre 1 y ${pendiente} Gs.` : 'Esa compra no tiene saldo pendiente.')
  }
  if (pago.accountId) {
    const cuenta = await tx.paymentAccount.findFirst({ where: { id: pago.accountId, tenantId: pago.tenantId, isActive: true }, select: { id: true } })
    if (!cuenta) throw new SupplierPayableInputError('La cuenta no existe o está inactiva.')
  }
  const fila = await tx.supplierPayable.update({ where: { id: compra.id }, data: { paidPyg: { increment: aPagar } } })
  let movimientoId: string | null = null
  if (pago.accountId) {
    const movimiento = await createCashMovement(tx, {
      tenantId: pago.tenantId, branchId: compra.branchId, createdById: pago.userId,
      kind: 'SUPPLIER_ADVANCE', direction: 'OUT', currency: 'PYG', originalAmount: String(aPagar), exchangeRatePyg: '1',
      counterparty: compra.supplierName, reference: compra.reference, description: pago.descripcion || `Pago a proveedor: ${compra.concept}`, dueAt: null, accountId: pago.accountId,
      idempotencyKey: pago.idempotencyKey ?? null,
    }, { auditAction: 'FINANCE_MOVEMENT_CREATED' })
    movimientoId = movimiento.id
  }
  await tx.auditLog.create({ data: { tenantId: pago.tenantId, userId: pago.userId, action: 'SUPPLIER_PAYABLE_PAID', entity: 'SupplierPayable', entityId: compra.id, metadata: { amountPyg: aPagar, saldoAnteriorPyg: pendiente, conCuenta: Boolean(pago.accountId), ...(pago.auditExtra ?? {}) } } })
  return { cuenta: fila, aPagar, saldoAnteriorPyg: pendiente, movimientoId }
}
