import { Prisma, type Payment, type PaymentAccount, type PaymentMethod, type PaymentStatus } from '@prisma/client'
import { LIMITE_MONTO_VENTAS, numero } from './montos'
import { codigoGiftCardValido } from './gift-card-code'
import { decideInitialPaymentState, parsePaymentVerification, type PaymentVerificationPolicy, type PendingReason } from './payment-verification-policy'

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
  // Efectivo realmente entregado (> originalAmount) cuando hubo vuelto (#455).
  tenderedAmount?: Prisma.Decimal;
  settlesAt?: Date;
  // Por qué nace PENDING (VERIFICACION/CUOTA/REPARTO/MANUAL); en un pago aprobado por SELF queda VERIFICACION.
  pendingReason?: PendingReason;
  // Solo informativo para quien crea el pago: NO es una columna (quitarlo antes de guardar).
  selfApproved?: boolean;
  dueAt?: Date;
  tradeIn?: TradeInInput;
  giftCard?: { code: string };
}
export function accountSnapshot(account: PaymentAccount): Prisma.InputJsonObject {
  // Foto inmutable para historial y trazabilidad (#144): incluye procesadora,
  // documento, llave y referencias para poder conciliar por medio/procesadora
  // aunque la cuenta cambie después.
  return { id: account.id, tenantId: account.tenantId, name: account.name, bank: account.bank, holder: account.holder,
    accountNumber: account.accountNumber, document: account.document, processor: account.processor, pixKey: account.pixKey,
    aliasType: account.aliasType, aliasValue: account.aliasValue,
    reference: account.reference, currencyLabel: account.currencyLabel, holderId: account.holderId, companyId: account.companyId,
    currency: account.currency, kind: account.kind, isActive: account.isActive,
    feePercent: account.feePercent.toString(), discountPct: account.discountPct.toString(), settlementDays: account.settlementDays }
}

// Origen de la cotización (#401): automática de una fuente o escrita a mano. Se
// guarda en la foto del pago como dato informativo; el valor que cuenta sigue
// siendo exchangeRatePyg. Un pago ya registrado nunca se recalcula.
export function rateOriginSnapshot(value: unknown): { rateOrigin?: Prisma.InputJsonObject } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const raw = value as Record<string, unknown>
  const at = typeof raw.at === 'string' && !Number.isNaN(Date.parse(raw.at)) ? new Date(raw.at).toISOString() : null
  if (raw.manual === true) return { rateOrigin: { manual: true, at } }
  const source = typeof raw.source === 'string' && /^[a-z]{2,30}$/.test(raw.source) ? raw.source : null
  const side = raw.side === 'compra' || raw.side === 'venta' ? raw.side : null
  return source && side ? { rateOrigin: { manual: false, source, side, at } } : {}
}

// On an idempotent replay, use the immutable snapshot: later account edits must not change the original operation.
//
// El estado del pago lo decide el SERVIDOR según la política de verificación de la
// empresa: lo que mande el cliente en `status` solo puede pedir «pendiente»; nunca
// fuerza CONFIRMED sobre un medio o cuenta que pide verificación. `ctx.skipPolicy`
// es para flujos internos ya autorizados (corrección de medio de pago).
export async function normalizePayment(tx: Prisma.TransactionClient, tenantId: string, value: unknown, previous?: Payment, ctx: { actor?: { role?: string | null }; policy?: PaymentVerificationPolicy; skipPolicy?: boolean } = {}): Promise<NormalizedPayment> {
  const input = objectInput(value)
  const requestedStatus = input.status ?? 'CONFIRMED'
  if (!['PENDING', 'CONFIRMED'].includes(requestedStatus as string)) throw new InputError('Estado de pago inválido: un cobro nuevo solo nace aprobado o pendiente.')
  // El estado se resuelve cuando se conoce el medio y la cuenta (más abajo).
  let status: 'PENDING' | 'CONFIRMED' = requestedStatus as 'PENDING' | 'CONFIRMED'
  let pendingReason: PendingReason | undefined
  let selfApproved = false
  const decideStatus = async (method: string, accountId: string | null) => {
    if (previous) { status = previous.status as 'PENDING' | 'CONFIRMED'; pendingReason = (previous.pendingReason as PendingReason | null) ?? undefined; return }
    if (ctx.skipPolicy) { if (status === 'PENDING') pendingReason = method === 'CREDIT' ? 'CUOTA' : 'MANUAL'; return }
    const policy = ctx.policy ?? parsePaymentVerification((await tx.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }))?.settings)
    const decision = decideInitialPaymentState(policy, { method, accountId, role: ctx.actor?.role ?? null, requestedStatus })
    status = decision.status
    pendingReason = decision.pendingReason ?? undefined
    selfApproved = decision.selfApproved
  }
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
      snapshot = { ...accountSnapshot(account), ...rateOriginSnapshot(input.exchangeRateOrigin) }
    }
    const currency = snapshot.currency as 'PYG' | 'USD' | 'BRL' | 'EUR' | 'USDT'
    const method = snapshot.kind as PaymentMethod
    if (input.method !== undefined && input.method !== method) throw new InputError('El método no coincide con la cuenta.')
    if (input.currency !== undefined && input.currency !== currency) throw new InputError('La moneda no coincide con la cuenta.')
    await decideStatus(method, accountId)
    const originalAmount = decimalInput(input.originalAmount, 'originalAmount', currency === 'PYG' ? 0 : 8)
    const exchangeRatePyg = decimalInput(input.exchangeRatePyg ?? (currency === 'PYG' ? 1 : undefined), 'exchangeRatePyg', 6)
    if (currency === 'PYG' && !exchangeRatePyg.eq(1)) throw new InputError('La cotización PYG debe ser 1.')
    const converted = originalAmount.mul(exchangeRatePyg).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
    if (converted.lt(1) || converted.gt(LIMITE_MONTO_VENTAS)) throw new InputError(`El monto convertido supera el máximo que el sistema puede guardar (Gs ${LIMITE_MONTO_VENTAS.toLocaleString('es-PY')}).`)
    result = { accountId, accountSnapshot: snapshot, currency, originalAmount, exchangeRatePyg, method,
      amountPyg: converted.toNumber(), status: status as PaymentStatus, reference }
    // Entrega real en efectivo (#455): solo cobro CASH confirmado, mayor a lo aplicado, en la moneda de la cuenta.
    if (input.tenderedAmount !== undefined && input.tenderedAmount !== null && input.tenderedAmount !== '') {
      if (method !== 'CASH' || status !== 'CONFIRMED') throw new InputError('La entrega con vuelto solo aplica a un cobro en efectivo confirmado.')
      const tendered = decimalInput(input.tenderedAmount, 'tenderedAmount', 2)
      if (currency === 'PYG' && !tendered.isInteger()) throw new InputError('La entrega en guaraníes debe ser un entero.')
      if (tendered.lt(originalAmount)) throw new InputError('La entrega no puede ser menor a lo aplicado al pago.')
      if (tendered.mul(exchangeRatePyg).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).gt(LIMITE_MONTO_VENTAS)) throw new InputError(`La entrega supera el máximo que el sistema puede guardar (Gs ${LIMITE_MONTO_VENTAS.toLocaleString('es-PY')}).`)
      if (tendered.gt(originalAmount)) result.tenderedAmount = tendered
    }
  } else {
    if (input.originalAmount !== undefined || input.exchangeRatePyg !== undefined || input.currency !== undefined) throw new InputError('Los campos de moneda requieren accountId.')
    const amountPyg = Number(input.amountPyg)
    if (!Number.isSafeInteger(amountPyg) || amountPyg <= 0 || amountPyg > LIMITE_MONTO_VENTAS || !['CASH', 'TRANSFER', 'CARD', 'CREDIT', 'TRADE_IN', 'PIX', 'STORE_CREDIT', 'GIFT_CARD'].includes(input.method as string)) throw new InputError(`El monto debe ser un entero positivo hasta ${LIMITE_MONTO_VENTAS.toLocaleString('es-PY')} y el método tiene que ser válido.`)
    await decideStatus(input.method as string, null)
    result = { amountPyg, method: input.method as PaymentMethod, status: status as PaymentStatus, reference }
  }
  if (pendingReason) result.pendingReason = pendingReason
  if (selfApproved) result.selfApproved = true
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
  // Gift card (#280): el canje viaja con el código y el monto aplicado; el saldo
  // se descuenta en la misma transacción del cobro (consumirGiftCard).
  if (result.method === 'GIFT_CARD') {
    if (result.status !== 'CONFIRMED') throw new InputError('El canje de una gift card requiere pago CONFIRMED.')
    const codigo = codigoGiftCardValido(input.giftCardCode)
    if (!codigo) throw new InputError('El código de gift card no es válido.')
    result.reference = result.reference || `GC ••${codigo.slice(-4)}`
    result.giftCard = { code: codigo }
  } else if (input.giftCardCode !== undefined && input.giftCardCode !== null && input.giftCardCode !== '') throw new InputError('giftCardCode solo corresponde al método GIFT_CARD.')
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
    && numero(previous.amountPyg) === next.amountPyg && (previous.reference || '') === (next.reference || '')
    && (previous.accountId ?? null) === (next.accountId ?? null) && (previous.currency ?? null) === (next.currency ?? null)
    && (previous.originalAmount == null ? next.originalAmount === undefined : next.originalAmount !== undefined && previous.originalAmount.eq(next.originalAmount))
    && (previous.exchangeRatePyg == null ? next.exchangeRatePyg === undefined : next.exchangeRatePyg !== undefined && previous.exchangeRatePyg.eq(next.exchangeRatePyg))
    && (previous.dueAt?.getTime() ?? null) === (next.dueAt?.getTime() ?? null)
    && (previous.tenderedAmount == null ? next.tenderedAmount === undefined : next.tenderedAmount !== undefined && previous.tenderedAmount.eq(next.tenderedAmount))
}

export async function receiveTradeIn(tx: Prisma.TransactionClient, input: TradeInInput | undefined, payment: { id: string; amountPyg: bigint | number }, order: { id: string; branchId: string | null }, tenantId: string, userId: string) {
  if (!input) return
  const valuePyg = numero(payment.amountPyg)
  const device = await tx.tradeInDevice.create({ data: { ...input, tenantId, branchId: order.branchId, orderId: order.id, paymentId: payment.id, valuePyg } })
  await tx.auditLog.create({ data: { tenantId, userId, action: 'TRADE_IN_RECEIVED', entity: 'TradeInDevice', entityId: device.id,
    metadata: { orderId: order.id, paymentId: payment.id, serial: input.serial, valuePyg, status: 'RECEIVED' } } })
}

/**
 * Vuelto (#455): si el cobro en efectivo trae una entrega mayor a lo aplicado, registra un egreso de caja
 * «Vuelto» en guaraníes ligado al pedido y al turno abierto de quien cobra. Idempotente: la clave
 * `vuelto:<paymentId>` es única por empresa, así que un reintento del mismo cobro no lo duplica.
 */
export async function registrarVuelto(tx: Prisma.TransactionClient, input: {
  tenantId: string; userId: string; order: { id: string; branchId: string | null; orderNumber: string }
  payment: { id: string; method: string; status: string; amountPyg: bigint | number; exchangeRatePyg: Prisma.Decimal | null; tenderedAmount: Prisma.Decimal | null }
}) {
  const { payment, order } = input
  if (payment.method !== 'CASH' || payment.status !== 'CONFIRMED' || !payment.tenderedAmount) return null
  const rate = payment.exchangeRatePyg ?? new Prisma.Decimal(1)
  const cambio = payment.tenderedAmount.mul(rate).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).minus(numero(payment.amountPyg))
  if (!cambio.gt(0)) return null
  const idempotencyKey = `vuelto:${payment.id}`
  const existente = await tx.cashMovement.findUnique({ where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey } } })
  if (existente) return existente
  const turno = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "CashSession" WHERE "tenantId" = ${input.tenantId} AND "openedById" = ${input.userId} AND "status" = 'OPEN' ${order.branchId ? Prisma.sql`AND "branchId" = ${order.branchId}` : Prisma.empty} ORDER BY "openedAt" DESC LIMIT 1`
  const amountPyg = cambio.toNumber()
  const movimiento = await tx.cashMovement.create({ data: {
    tenantId: input.tenantId, branchId: order.branchId, createdById: input.userId, kind: 'CHANGE', direction: 'OUT', currency: 'PYG',
    originalAmount: amountPyg, exchangeRatePyg: 1, amountPyg, description: `Vuelto del pedido ${order.orderNumber}`, reference: order.orderNumber,
    status: 'CLEARED', clearedAt: new Date(), orderId: order.id, cashSessionId: turno[0]?.id ?? null, idempotencyKey,
  } })
  await tx.auditLog.create({ data: { tenantId: input.tenantId, userId: input.userId, action: 'CASH_CHANGE_RECORDED', entity: 'CashMovement', entityId: movimiento.id, metadata: { orderId: order.id, paymentId: payment.id, amountPyg, tendered: payment.tenderedAmount.toString() } } })
  return movimiento
}
