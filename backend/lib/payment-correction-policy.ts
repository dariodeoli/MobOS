// Quién puede corregir el medio de un pago ya cobrado (#393). Una sola regla
// para la ruta de corrección y el ajuste del negocio (patrón de cost-visibility):
// ADMIN/GERENTE corrigen cualquier pago; VENDEDOR/CAJERA solo pagos propios de su
// turno abierto y sin verificar, mientras el dueño lo permita (por defecto sí);
// REPARTIDOR y cualquier otro rol, nunca.

const MANAGER_ROLES = ['ADMIN', 'GERENTE']
const STAFF_ROLES = ['VENDEDOR', 'CAJERA']

/** Ajuste del negocio (Tenant.settings.permissions.staffCorrectsPayments). Ausente = true. */
export function staffCorrectsPaymentsFrom(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return true
  const permissions = (settings as Record<string, unknown>).permissions
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) return true
  return (permissions as Record<string, unknown>).staffCorrectsPayments !== false
}

export type PaymentCorrectionTarget = {
  /** Quién registró el cobro (Payment.userId / createdById). */
  userId: string | null
  createdById: string | null
  /** Estado de conciliación del pago original (null = sin conciliación). */
  reconciliationState: 'PENDING' | 'VERIFIED' | 'REJECTED' | null
  /** El pago salió de un turno de caja que sigue abierto. */
  originSessionOpen: boolean
}

export type PaymentCorrectionDecision = { allowed: true } | { allowed: false; message: string }

const deny = (message: string): PaymentCorrectionDecision => ({ allowed: false, message })

/**
 * Decide si `user` puede corregir `target`. Un pago VERIFIED solo lo corrige el
 * dueño (ADMIN); el personal de caja/venta además necesita que el pago sea
 * propio, de su turno abierto y que el ajuste del negocio lo permita.
 */
export function canCorrectPayment(
  user: { id: string; role: string | null | undefined },
  target: PaymentCorrectionTarget,
  settings?: unknown,
): PaymentCorrectionDecision {
  const role = user.role || ''
  if (!MANAGER_ROLES.includes(role) && !STAFF_ROLES.includes(role)) return deny('Tu rol no puede corregir pagos.')
  if (target.reconciliationState === 'VERIFIED' && role !== 'ADMIN') return deny('El pago ya está verificado: solo el dueño puede corregirlo.')
  if (MANAGER_ROLES.includes(role)) return { allowed: true }
  if (!staffCorrectsPaymentsFrom(settings)) return deny('El dueño no habilitó que caja y vendedores corrijan pagos.')
  if (target.userId !== user.id && target.createdById !== user.id) return deny('Solo podés corregir pagos que cobraste vos.')
  if (!target.originSessionOpen) return deny('Solo podés corregir pagos de tu turno de caja abierto.')
  return { allowed: true }
}

/** Roles que nunca corrigen: se rechazan antes de leer el pedido. */
export function canEverCorrectPayments(role: string | null | undefined) {
  return !!role && (MANAGER_ROLES.includes(role) || STAFF_ROLES.includes(role))
}

const SETTINGS_TTL_MS = 5000
const settingsCache = new Map<string, { at: number; value: boolean }>()

export function invalidatePaymentCorrectionPolicy(tenantId: string) {
  settingsCache.delete(tenantId)
}

/** Lee el ajuste del negocio (caché corta por proceso; se invalida al guardar). */
export async function staffCorrectsPayments(tenantId: string): Promise<boolean> {
  const hit = settingsCache.get(tenantId)
  if (hit && Date.now() - hit.at < SETTINGS_TTL_MS) return hit.value
  const { prisma } = await import('./prisma')
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } })
  const value = staffCorrectsPaymentsFrom(tenant?.settings)
  settingsCache.set(tenantId, { at: Date.now(), value })
  return value
}
