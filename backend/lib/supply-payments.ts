// Venta sin stock · pago de la compra al proveedor (decisiones de plata A, B y D).
//
//  A. «Marcar pagado» eligiendo cuenta crea la salida de caja/banco por el monto
//     (misma lógica que `supplierPayment`, extraída a `registrarPagoAProveedor`).
//  B. La compra «contado» no nace pagada sin salida: pide la cuenta de origen.
//     Sin permiso de Finanzas queda «ya pagada» sin cuenta y Finanzas completa la
//     cuenta después (sin doble salida).
//  D. El encargado de stock marca pagado; elegir la cuenta exige Finanzas.
//
// Cada paso se audita y cada salida de caja lleva una clave única por compra: un
// reintento o dos toques seguidos no registran dos veces la plata.
import type { Prisma } from '@prisma/client'
import { registrarPagoAProveedor, saldoDeCuenta, SupplierPayableInputError } from './supplier-payables'
import { createCashMovement } from './cash-movements'
import { numero } from './montos'

type Tx = Prisma.TransactionClient

export class PagoCompraError extends Error {
  constructor(message: string, public status = 409) { super(message) }
}

export const claveSalidaDeCompra = (purchaseId: string) => `supply-purchase-paid:${purchaseId}`

export type ResultadoPago = { pagadoPyg: number; conCuenta: boolean; pendienteDeCuenta: boolean; movimientoId: string | null }

/**
 * Qué se hace según quién paga y si trae cuenta (puro):
 *  · Finanzas sin cuenta  → 400, hay que elegir de dónde salió la plata;
 *  · sin Finanzas con cuenta → 403;
 *  · Finanzas con cuenta  → salida de caja;
 *  · sin Finanzas sin cuenta → «ya pagado» sin cuenta, pendiente de asignar.
 */
export function modoDePago({ finanzas, accountId }: { finanzas: boolean; accountId?: string | null }): 'CON_CUENTA' | 'SIN_CUENTA' {
  const cuenta = typeof accountId === 'string' && accountId.trim() ? accountId.trim() : ''
  if (finanzas && !cuenta) throw new PagoCompraError('Elegí la cuenta de la que salió la plata.', 400)
  if (!finanzas && cuenta) throw new PagoCompraError('Elegir la cuenta exige el permiso de Finanzas: marcá «ya pagado» y Finanzas asigna la cuenta.', 403)
  return cuenta ? 'CON_CUENTA' : 'SIN_CUENTA'
}

export async function marcarCompraPagada(tx: Tx, { tenantId, userId, purchaseId, accountId = null, finanzas }: { tenantId: string; userId: string; purchaseId: string; accountId?: string | null; finanzas: boolean }): Promise<ResultadoPago> {
  const compra = await tx.supplyPurchase.findFirst({ where: { id: purchaseId, tenantId }, select: { id: true, code: true, status: true, paidAt: true, supplierName: true } })
  if (!compra) throw new PagoCompraError('Compra no encontrada.', 404)
  if (compra.status === 'CANCELADA') throw new PagoCompraError('La compra está cancelada.', 409)
  const cuenta = await tx.supplierPayable.findFirst({ where: { supplyPurchaseId: compra.id, tenantId } })
  if (!cuenta || numero(cuenta.amountPyg) <= 0) throw new PagoCompraError('Cargá primero el costo de la compra: sin monto no hay salida de caja.', 409)
  const saldo = saldoDeCuenta(cuenta)
  if (compra.paidAt || saldo <= 0) throw new PagoCompraError('La compra ya está pagada.', 409)
  const modo = modoDePago({ finanzas, accountId })
  // Se reclama el pago de forma atómica: dos toques seguidos no pagan dos veces.
  const ahora = new Date()
  const reclamo = await tx.supplyPurchase.updateMany({
    where: { id: compra.id, tenantId, paidAt: null },
    data: { paidAt: ahora, paidById: userId, paidAccountId: modo === 'CON_CUENTA' ? accountId!.trim() : null, paymentPendingAccount: modo === 'SIN_CUENTA' },
  })
  if (reclamo.count !== 1) throw new PagoCompraError('La compra ya está pagada.', 409)
  let movimientoId: string | null = null
  try {
    if (modo === 'CON_CUENTA') {
      const pago = await registrarPagoAProveedor(tx, {
        tenantId, userId, payableId: cuenta.id, amountPyg: saldo, accountId: accountId!.trim(), saldoPagable: saldoDeCuenta,
        idempotencyKey: claveSalidaDeCompra(compra.id), descripcion: `Pago de compra ${compra.code}`, auditExtra: { compra: compra.code },
      })
      movimientoId = pago.movimientoId
    } else {
      // «Ya pagado» sin cuenta: se suma al pagado sin salida de caja hasta que Finanzas asigne la cuenta.
      await tx.supplierPayable.update({ where: { id: cuenta.id }, data: { paidPyg: { increment: saldo } } })
      await tx.auditLog.create({ data: { tenantId, userId, action: 'SUPPLIER_PAYABLE_PAID', entity: 'SupplierPayable', entityId: cuenta.id, metadata: { amountPyg: saldo, saldoAnteriorPyg: saldo, conCuenta: false, compra: compra.code } } })
    }
  } catch (cause) {
    if (cause instanceof SupplierPayableInputError) throw new PagoCompraError(cause.message, 400)
    throw cause
  }
  await tx.auditLog.create({ data: { tenantId, userId, action: modo === 'CON_CUENTA' ? 'SUPPLY_PURCHASE_PAID' : 'SUPPLY_PURCHASE_PAID_NO_ACCOUNT', entity: 'SupplyPurchase', entityId: compra.id, metadata: { code: compra.code, amountPyg: saldo, accountId: modo === 'CON_CUENTA' ? accountId!.trim() : null, movimientoId } } })
  return { pagadoPyg: saldo, conCuenta: modo === 'CON_CUENTA', pendienteDeCuenta: modo === 'SIN_CUENTA', movimientoId }
}

/**
 * Finanzas completa la cuenta de una compra que quedó «ya pagada» sin cuenta:
 * registra la salida de caja UNA sola vez (la compra ya figura pagada, no se
 * suma de nuevo al pagado).
 */
export async function asignarCuentaDePago(tx: Tx, { tenantId, userId, purchaseId, accountId, branchId = null }: { tenantId: string; userId: string; purchaseId: string; accountId: string; branchId?: string | null }) {
  const compra = await tx.supplyPurchase.findFirst({ where: { id: purchaseId, tenantId, ...(branchId ? { branchId } : {}) }, select: { id: true, code: true, branchId: true, supplierName: true } })
  if (!compra) throw new PagoCompraError('Compra no encontrada.', 404)
  const cuenta = await tx.supplierPayable.findFirst({ where: { supplyPurchaseId: compra.id, tenantId } })
  if (!cuenta || numero(cuenta.paidPyg) <= 0) throw new PagoCompraError('La compra no tiene un pago registrado.', 409)
  const cuentaDePago = await tx.paymentAccount.findFirst({ where: { id: accountId, tenantId, isActive: true }, select: { id: true } })
  if (!cuentaDePago) throw new PagoCompraError('La cuenta no existe o está inactiva.', 400)
  const reclamo = await tx.supplyPurchase.updateMany({ where: { id: compra.id, tenantId, paymentPendingAccount: true }, data: { paymentPendingAccount: false, paidAccountId: accountId } })
  if (reclamo.count !== 1) throw new PagoCompraError('Esa compra no está pendiente de cuenta (ya se asignó).', 409)
  const monto = numero(cuenta.paidPyg)
  const movimiento = await createCashMovement(tx, {
    tenantId, branchId: cuenta.branchId, createdById: userId, kind: 'SUPPLIER_ADVANCE', direction: 'OUT', currency: 'PYG',
    originalAmount: String(monto), exchangeRatePyg: '1', counterparty: cuenta.supplierName, reference: cuenta.reference,
    description: `Pago de compra ${compra.code} (cuenta asignada por Finanzas)`, dueAt: null, accountId, idempotencyKey: claveSalidaDeCompra(compra.id),
  }, { auditAction: 'FINANCE_MOVEMENT_CREATED' })
  await tx.auditLog.create({ data: { tenantId, userId, action: 'SUPPLY_PURCHASE_ACCOUNT_ASSIGNED', entity: 'SupplyPurchase', entityId: compra.id, metadata: { code: compra.code, amountPyg: monto, accountId, movimientoId: movimiento.id } } })
  return { amountPyg: monto, movimientoId: movimiento.id }
}
