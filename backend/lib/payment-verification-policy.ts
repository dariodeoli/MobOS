// Política de verificación de pagos (puro, sin base de datos).
//
// Vive en Tenant.settings.paymentVerification:
//   { methods: { PIX: 'verificar', ... }, accounts: { [accountId]: 'auto'|'verificar' },
//     requireProof, blockDelivery, selfApproveRoles: ['ADMIN'] }
//
// Empresas EXISTENTES (sin la clave) quedan todo en automático: nada cambia
// hasta que la activen. Empresas NUEVAS arrancan con PIX, USDT y transferencia
// en «verificar» (defaultPaymentVerificationSettings se guarda al crearlas).
// Efectivo, canje, gift card, saldo a favor y crédito son SIEMPRE automáticos:
// la caja de efectivo no cambia.

export const VERIFY_MODES = ['auto', 'verificar'] as const
export type VerifyMode = typeof VERIFY_MODES[number]
export const VERIFIABLE_METHODS = ['CARD', 'PIX', 'CRYPTO', 'TRANSFER'] as const
export const PENDING_REASONS = ['VERIFICACION', 'CUOTA', 'REPARTO', 'MANUAL'] as const
export type PendingReason = typeof PENDING_REASONS[number]
/** Roles que pueden verificar pagos (el resto de los roles nunca). */
export const PAYMENT_VERIFIER_ROLES = ['ADMIN', 'GERENTE', 'CAJERA'] as const
const ROLES = ['ADMIN', 'GERENTE', 'CAJERA', 'VENDEDOR', 'REPARTIDOR'] as const

export type PaymentVerificationPolicy = {
  methods: Record<string, VerifyMode>
  accounts: Record<string, VerifyMode>
  requireProof: boolean
  blockDelivery: boolean
  selfApproveRoles: string[]
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const mode = (value: unknown): VerifyMode | null => value === 'verificar' || value === 'auto' ? value : null

/** Valores guardados al crear una empresa nueva. */
export function defaultPaymentVerificationSettings() {
  return {
    methods: { CASH: 'auto', CARD: 'auto', PIX: 'verificar', CRYPTO: 'verificar', TRANSFER: 'verificar' },
    accounts: {},
    requireProof: true,
    blockDelivery: true,
    selfApproveRoles: [] as string[],
  }
}

/** Lee `settings.paymentVerification`. Sin la clave (empresa existente): todo automático. */
export function parsePaymentVerification(settings: unknown): PaymentVerificationPolicy {
  const raw = record(record(settings).paymentVerification)
  const methodsRaw = record(raw.methods)
  const accountsRaw = record(raw.accounts)
  const methods: Record<string, VerifyMode> = {}
  for (const method of VERIFIABLE_METHODS) methods[method] = mode(methodsRaw[method]) ?? 'auto'
  const accounts: Record<string, VerifyMode> = {}
  for (const [id, value] of Object.entries(accountsRaw).slice(0, 500)) {
    const parsed = mode(value)
    if (id && id.length <= 200 && parsed) accounts[id] = parsed
  }
  const selfApproveRoles = Array.isArray(raw.selfApproveRoles)
    ? [...new Set(raw.selfApproveRoles.filter((role): role is string => typeof role === 'string' && (ROLES as readonly string[]).includes(role)))]
    : []
  return {
    methods,
    accounts,
    requireProof: raw.requireProof === undefined ? true : raw.requireProof === true,
    blockDelivery: raw.blockDelivery === undefined ? true : raw.blockDelivery === true,
    selfApproveRoles,
  }
}

/** ¿Este medio/cuenta pide verificación? La cuenta manda sobre el medio. Solo medios verificables. */
export function requiresVerification(policy: PaymentVerificationPolicy, input: { method: string; accountId?: string | null }): boolean {
  if (!(VERIFIABLE_METHODS as readonly string[]).includes(input.method)) return false
  const byAccount = input.accountId ? policy.accounts[input.accountId] : undefined
  return (byAccount ?? policy.methods[input.method] ?? 'auto') === 'verificar'
}

export const canVerifyPayments = (role: string) => (PAYMENT_VERIFIER_ROLES as readonly string[]).includes(role)
export const mayApproveOwnPayment = (policy: PaymentVerificationPolicy, role: string) => policy.selfApproveRoles.includes(role)

export type InitialPaymentState = {
  status: 'CONFIRMED' | 'PENDING'
  /** En un pago aprobado por SELF queda VERIFICACION: es el origen, para listarlo en «Aprobados». */
  pendingReason: PendingReason | null
  /** Quedó aprobado por el propio rol autorizado (se audita como SELF). */
  selfApproved: boolean
}

/**
 * Estado con el que nace un pago. El servidor decide: lo que el cliente mande
 * como `status` solo puede PEDIR «pendiente» (queda MANUAL o CUOTA); nunca
 * fuerza CONFIRMED sobre un medio que pide verificación.
 */
export function decideInitialPaymentState(policy: PaymentVerificationPolicy, input: {
  method: string; accountId?: string | null; role?: string | null; requestedStatus?: unknown
}): InitialPaymentState {
  const wantsPending = input.requestedStatus === 'PENDING'
  if (requiresVerification(policy, input)) {
    if (input.role && mayApproveOwnPayment(policy, input.role) && !wantsPending) return { status: 'CONFIRMED', pendingReason: 'VERIFICACION', selfApproved: true }
    return { status: 'PENDING', pendingReason: 'VERIFICACION', selfApproved: false }
  }
  if (wantsPending) return { status: 'PENDING', pendingReason: input.method === 'CREDIT' ? 'CUOTA' : 'MANUAL', selfApproved: false }
  return { status: 'CONFIRMED', pendingReason: null, selfApproved: false }
}

/** PENDING sin motivo (pagos viejos) se trata como MANUAL, nunca como VERIFICACION. */
export const effectivePendingReason = (reason: string | null | undefined): PendingReason =>
  (PENDING_REASONS as readonly string[]).includes(reason ?? '') ? reason as PendingReason : 'MANUAL'

export type SelfApprovalSubject = { createdById?: string | null; userId?: string | null; deliveryUserId?: string | null }
/** Quien creó o cobró el pago no puede aprobarlo, salvo rol autorizado por la configuración. */
export function isOwnPayment(payment: SelfApprovalSubject, actorId: string): boolean {
  return [payment.createdById, payment.userId, payment.deliveryUserId].some(id => id && id === actorId)
}
