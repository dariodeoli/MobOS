import type { Prisma } from '@prisma/client'
import type { SessionContext } from './auth'
import { PAYMENT_VERIFIER_ROLES, isOwnPayment, mayApproveOwnPayment, type PaymentVerificationPolicy } from './payment-verification-policy'

// Alcance de quien mira o resuelve pagos por verificar:
//  - ADMIN: toda la empresa (o la sucursal que pida);
//  - GERENTE y CAJERA: su sucursal (un gerente sin sucursal ve toda la empresa);
//  - VENDEDOR: solo los pagos de sus propios pedidos, sin poder resolverlos.
// Siempre dentro de su empresa (tenantId).

export function canViewVerification(role: string) {
  return (PAYMENT_VERIFIER_ROLES as readonly string[]).includes(role) || role === 'VENDEDOR'
}

/** Filtro de pedido para el alcance de la sesión; `null` = el rol no puede ver nada. */
export function verificationOrderScope(session: SessionContext, requestedBranchId?: string | null): Prisma.OrderWhereInput | null {
  const { role, branchId, id } = session.user
  const tenantId = session.user.tenantId
  if (role === 'VENDEDOR') return { tenantId, sellerId: id, ...(branchId ? { branchId } : {}) }
  if (role === 'ADMIN') return { tenantId, ...(requestedBranchId ? { branchId: requestedBranchId } : {}) }
  if (role === 'GERENTE') return { tenantId, ...(branchId ? { branchId } : requestedBranchId ? { branchId: requestedBranchId } : {}) }
  if (role === 'CAJERA') return branchId ? { tenantId, branchId } : null
  return null
}

/** ¿Esta persona puede aprobar este pago? Verificador y, si es propio, con permiso de la empresa. */
export function canResolvePayment(role: string, userId: string, payment: { createdById?: string | null; userId?: string | null; deliveryUserId?: string | null }, policy: PaymentVerificationPolicy) {
  if (!(PAYMENT_VERIFIER_ROLES as readonly string[]).includes(role)) return false
  return !isOwnPayment(payment, userId) || mayApproveOwnPayment(policy, role)
}
