import { Prisma, type Payment, type PaymentAccount, type PaymentMethod, type PaymentStatus } from '@prisma/client'

export const INT_MAX = 2147483647
export class InputError extends Error {
  constructor(message: string, public readonly status = 400) { super(message) }
}
export function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Objeto JSON obligatorio.')
  return value as Record<string, unknown>
}
export function textInput(value: unknown, name: string, max = 2000): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new InputError(`${name} debe ser texto no vacío de hasta ${max} caracteres.`)
  return value.trim()
}
export function decimalInput(value: unknown, name: string, scale: number, allowZero = false): Prisma.Decimal {
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d+(?:\.\d+)?$/.test(String(value)) || String(value).length > 40) throw new InputError(`${name} debe ser un decimal positivo.`)
  const result = new Prisma.Decimal(value)
  if (!result.isFinite() || result.isNegative() || (!allowZero && result.isZero()) || result.decimalPlaces() > scale || result.gte('1000000000000')) throw new InputError(`${name} fuera de rango o con más de ${scale} decimales.`)
  return result
}
export type TradeInInput = { serial: string; model: string; conditionNotes: string }
type NormalizedPayment = {
  method: PaymentMethod; status: PaymentStatus; amountPyg: number; reference: string | null;
  accountId?: string; accountSnapshot?: Prisma.InputJsonObject; currency?: 'PYG' | 'USD' | 'BRL' | 'EUR' | 'USDT';
  originalAmount?: Prisma.Decimal; exchangeRatePyg?: Prisma.Decimal;
  settlesAt?: Date;
  dueAt?: Date;
  tradeIn?: TradeInInput;
}
export function accountSnapshot(account: PaymentAccount): Prisma.InputJsonObject {
  return { id: account.id, tenantId: account.tenantId, name: account.name, bank: account.bank, holder: account.holder,
    accountNumber: account.accountNumber, currency: account.currency, kind: account.kind, isActive: account.isActive,
    feePercent: account.feePercent.toString(), settlementDays: account.settlementDays }
}

// On an idempotent replay, use the immutable snapshot: later account edits must not change the original operation.
export async function normalizePayment(tx: Prisma.TransactionClient, tenantId: string, value: unknown, previous?: Payment): Promise<NormalizedPayment> {
  const input = objectInput(value)
  const status = input.status ?? 'CONFIRMED'
  if (!['PENDING', 'CONFIRMED', 'REJECTED', 'REFUNDED'].includes(status as string)) throw new InputError('Estado de pago inválido.')
  let reference: string | null = null
  if (input.reference !== undefined && input.reference !== null && input.reference !== '') reference = textInput(input.reference, 'reference')
  let result: NormalizedPayment
  if (input.accountId !== undefined && input.accountId !== null && input.accountId !== '') {
    const accountId = textInput(input.accountId, 'accountId', 200)
    if (previous && previous.accountId !== accountId) throw new InputError('El identificador ya pertenece a otro pago.', 409)
    let snapshot: Prisma.InputJsonObject
    if (previous?.accountSnapshot) {
      snapshot = objectInput(previous.accountSnapshot) as Prisma.InputJsonObject
    } else {
      await tx.$queryRaw`SELECT "id" FROM "PaymentAccount" WHERE "id" = ${accountId} AND "tenantId" = ${tenantId} FOR SHARE`
      const account = await tx.paymentAccount.findFirst({ where: { id: accountId, tenantId, isActive: true } })
      if (!account) throw new InputError('Cuenta de pago no encontrada o inactiva.', 409)
      snapshot = accountSnapshot(account)
    }
    const currency = snapshot.currency as 'PYG' | 'USD' | 'BRL' | 'EUR' | 'USDT'
    const method = snapshot.kind as PaymentMethod
    if (input.method !== undefined && input.method !== method) throw new InputError('El método no coincide con la cuenta.')
    if (input.currency !== undefined && input.currency !== currency) throw new InputError('La moneda no coincide con la cuenta.')
    const originalAmount = decimalInput(input.originalAmount, 'originalAmount', currency === 'PYG' ? 0 : 8)
    const exchangeRatePyg = decimalInput(input.exchangeRatePyg ?? (currency === 'PYG' ? 1 : undefined), 'exchangeRatePyg', 6)
    if (currency === 'PYG' && !exchangeRatePyg.eq(1)) throw new InputError('La cotización PYG debe ser 1.')
    const converted = originalAmount.mul(exchangeRatePyg).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
    if (converted.lt(1) || converted.gt(INT_MAX)) throw new InputError('Monto convertido fuera de rango.')
    result = { accountId, accountSnapshot: snapshot, currency, originalAmount, exchangeRatePyg, method,
      amountPyg: converted.toNumber(), status: status as PaymentStatus, reference }
  } else {
    if (input.originalAmount !== undefined || input.exchangeRatePyg !== undefined || input.currency !== undefined) throw new InputError('Los campos de moneda requieren accountId.')
    const amountPyg = Number(input.amountPyg)
    if (!Number.isSafeInteger(amountPyg) || amountPyg <= 0 || amountPyg > INT_MAX || !['CASH', 'TRANSFER', 'CARD', 'CREDIT', 'TRADE_IN', 'PIX'].includes(input.method as string)) throw new InputError('Monto entero positivo y método válido son obligatorios.')
    result = { amountPyg, method: input.method as PaymentMethod, status: status as PaymentStatus, reference }
  }
  // Previsión de acreditación: medios con settlementDays (tarjeta, PIX) tienen
  // fecha estimada de ingreso a la cuenta de la empresa.
  const snapshotDays = result.accountSnapshot && typeof result.accountSnapshot === 'object' && 'settlementDays' in (result.accountSnapshot as Record<string, unknown>) ? Number((result.accountSnapshot as Record<string, unknown>).settlementDays) : 0
  if (result.status === 'CONFIRMED' && Number.isSafeInteger(snapshotDays) && snapshotDays > 0) {
    result.settlesAt = new Date(Date.now() + snapshotDays * 86400000)
  }
  if (result.method === 'TRADE_IN') {
    if (result.status !== 'CONFIRMED') throw new InputError('La recepción trade-in requiere pago CONFIRMED.')
    const device = objectInput(input.tradeIn)
    result.tradeIn = { serial: textInput(device.serial, 'serial', 100).toUpperCase(), model: textInput(device.model, 'model', 200), conditionNotes: textInput(device.conditionNotes, 'conditionNotes') }
  } else if (input.tradeIn !== undefined && input.tradeIn !== null) throw new InputError('tradeIn solo corresponde al método TRADE_IN.')
  // Vencimiento de una cuota a crédito pendiente: es la fecha que usan los
  // recordatorios (email y WhatsApp) y el control de mora.
  const rawDueAt = input.dueAt
  if (rawDueAt !== undefined && rawDueAt !== null && rawDueAt !== '') {
    if (result.status !== 'PENDING' || result.method !== 'CREDIT') throw new InputError('El vencimiento solo aplica a una cuota a crédito pendiente.')
    const dueDate = rawDueAt instanceof Date ? rawDueAt : new Date(String(rawDueAt))
    if (!Number.isFinite(dueDate.getTime())) throw new InputError('Vencimiento de la cuota inválido.')
    result.dueAt = dueDate
  }
  return result
}

export function matchesPayment(previous: Payment, next: NormalizedPayment, orderId: string) {
  return previous.orderId === orderId && previous.method === next.method && previous.status === next.status
    && previous.amountPyg === next.amountPyg && (previous.reference || '') === (next.reference || '')
    && (previous.accountId ?? null) === (next.accountId ?? null) && (previous.currency ?? null) === (next.currency ?? null)
    && (previous.originalAmount == null ? next.originalAmount === undefined : next.originalAmount !== undefined && previous.originalAmount.eq(next.originalAmount))
    && (previous.exchangeRatePyg == null ? next.exchangeRatePyg === undefined : next.exchangeRatePyg !== undefined && previous.exchangeRatePyg.eq(next.exchangeRatePyg))
    && (previous.dueAt?.getTime() ?? null) === (next.dueAt?.getTime() ?? null)
}

export async function receiveTradeIn(tx: Prisma.TransactionClient, input: TradeInInput | undefined, payment: { id: string; amountPyg: number }, order: { id: string; branchId: string | null }, tenantId: string, userId: string) {
  if (!input) return
  const device = await tx.tradeInDevice.create({ data: { ...input, tenantId, branchId: order.branchId, orderId: order.id, paymentId: payment.id, valuePyg: payment.amountPyg } })
  await tx.auditLog.create({ data: { tenantId, userId, action: 'TRADE_IN_RECEIVED', entity: 'TradeInDevice', entityId: device.id,
    metadata: { orderId: order.id, paymentId: payment.id, serial: input.serial, valuePyg: payment.amountPyg, status: 'RECEIVED' } } })
}
