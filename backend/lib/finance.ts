import { Prisma } from '@prisma/client'

export const FINANCE_CURRENCIES = ['PYG', 'USD', 'BRL', 'EUR', 'USDT'] as const
export type FinanceCurrency = (typeof FINANCE_CURRENCIES)[number]

export class FinanceInputError extends Error {}

const INT_MAX = 2147483647

export function frozenAmountPyg(originalAmount: unknown, currency: FinanceCurrency, exchangeRatePyg: unknown): number {
  const amount = new Prisma.Decimal(originalAmount as Prisma.Decimal.Value)
  const rate = new Prisma.Decimal(exchangeRatePyg as Prisma.Decimal.Value)
  if (!amount.isFinite() || amount.lte(0) || !rate.isFinite() || rate.lte(0)) throw new FinanceInputError('Monto o cotización inválidos.')
  if (currency === 'PYG' && !rate.eq(1)) throw new FinanceInputError('La cotización PYG debe ser 1.')
  const result = amount.mul(rate).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
  if (result.lt(1) || result.gt(INT_MAX)) throw new FinanceInputError('El monto convertido supera el máximo que el sistema puede guardar (Gs 2.147.483.647).')
  return result.toNumber()
}

export type MarginLine = { quantity: number; totalPyg: number; unitCostPyg: number | null; insurancePyg?: number; extraCostPyg?: number }

/**
 * Costo ya congelado al vender: base + seguro + extras, sin reinterpretar la
 * venta. `discountPyg` es el descuento del carrito (nivel orden): la venta
 * reconocida para el margen es la neta de ese descuento.
 */
export function realMargin(lines: MarginLine[], { discountPyg = 0 }: { discountPyg?: number } = {}) {
  if (!Number.isSafeInteger(discountPyg) || discountPyg < 0) throw new FinanceInputError('Descuento inválido.')
  let revenuePyg = 0
  let costPyg = 0
  let unknownCostLines = 0
  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || !Number.isSafeInteger(line.totalPyg) || line.totalPyg < 0) throw new FinanceInputError('Línea financiera inválida.')
    revenuePyg += line.totalPyg
    if (line.unitCostPyg === null || line.unitCostPyg === undefined) { unknownCostLines += 1; continue }
    if (!Number.isSafeInteger(line.unitCostPyg) || line.unitCostPyg < 0) throw new FinanceInputError('Costo de línea inválido.')
    costPyg += line.unitCostPyg * line.quantity
  }
  const netoPyg = Math.max(0, revenuePyg - discountPyg)
  return { revenuePyg: netoPyg, costPyg, profitPyg: netoPyg - costPyg, marginPct: netoPyg ? Number((((netoPyg - costPyg) / netoPyg) * 100).toFixed(2)) : null, unknownCostLines }
}

export function balanceDirection(direction: 'IN' | 'OUT', amount: number) {
  if (!Number.isFinite(amount) || amount < 0) throw new FinanceInputError('Importe inválido.')
  return direction === 'IN' ? amount : -amount
}

/**
 * Seguro de una línea de venta (#162): porcentaje sobre el costo del producto.
 * costo real = costo + seguro; el margen es venta − costo real.
 * Ejemplo: costo 100.000, venta 150.000, seguro 25% → costo real 125.000 y
 * margen 25.000 (sin seguro serían 50.000).
 */
export function seguroDeCosto(baseCostPyg: number, insurancePct: number) {
  if (!Number.isSafeInteger(baseCostPyg) || baseCostPyg < 0) throw new FinanceInputError('Costo base inválido.')
  if (!Number.isFinite(insurancePct) || insurancePct < 0 || insurancePct > 100) throw new FinanceInputError('El porcentaje de seguro debe estar entre 0 y 100.')
  return Math.round((baseCostPyg * insurancePct) / 100)
}

export function margenConSeguro({ costoPyg, ventaPyg, seguroPct }: { costoPyg: number; ventaPyg: number; seguroPct: number }) {
  const seguroPyg = seguroDeCosto(costoPyg, seguroPct)
  const costoRealPyg = costoPyg + seguroPyg
  return { seguroPyg, costoRealPyg, margenPyg: ventaPyg - costoRealPyg }
}

export type PayablePurchaseLine = { quantity: number; unitCostPyg: number; finalTotalCostPyg: number }
export type PayablePurchase = { id: string; supplierName: string; lines: PayablePurchaseLine[]; payments: Array<{ amountPyg: number }> }

/** Compra a pagar: el total es la suma del costo final congelado por línea
 * (ya prorrateado al recibir la compra), no cantidad × costo base + gastos
 * crudos. Consistente con purchaseTotals() de purchases.ts. */
export function purchasePayable(purchase: PayablePurchase) {
  const totalPyg = purchase.lines.reduce((total, line) => total + line.finalTotalCostPyg, 0)
  const paidPyg = purchase.payments.reduce((total, payment) => total + Number(payment.amountPyg || 0), 0)
  return { id: purchase.id, supplierName: purchase.supplierName, totalPyg, paidPyg, pendingPyg: Math.max(0, totalPyg - paidPyg) }
}
