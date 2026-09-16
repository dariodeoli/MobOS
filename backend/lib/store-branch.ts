import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import type { SessionContext } from './auth'

const AUTO_BRANCH_ROLES = ['ADMIN', 'GERENTE'] as const
const DEFAULT_BRANCH_NAME = 'Sucursal principal'

/**
 * Idempotente y transaccional: garantiza que un ADMIN o GERENTE sin sucursal
 * quede operativo sin que el servidor elija por él en tenants multi-sucursal.
 *
 * - Con `branchId` ya asignado devuelve ese id sin tocar la base.
 * - Con exactamente una sucursal activa, se la asigna al usuario.
 * - Sin sucursales, crea "Sucursal principal" y se la asigna.
 * - Con varias sucursales devuelve null: el cliente debe elegir.
 * - VENDEDOR y CAJERA sin sucursal devuelven null.
 */
export async function ensureStoreBranch(session: SessionContext): Promise<string | null> {
  if (session.user.branchId) return session.user.branchId
  if (!(AUTO_BRANCH_ROLES as readonly string[]).includes(session.user.role)) return null
  return prisma.$transaction(async tx => {
    // Re-lee dentro de la transacción: otra petición pudo asignar la sucursal
    // después de crearse la sesión. Solo se persiste el branchId; la identidad
    // del usuario no cambia.
    const current = await tx.user.findFirst({ where: { id: session.user.id, tenantId: session.user.tenantId }, select: { id: true, branchId: true } })
    if (!current) return null
    if (current.branchId) return current.branchId
    const branches = await tx.branch.findMany({ where: { tenantId: session.user.tenantId, isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } })
    if (branches.length === 1) {
      await tx.user.update({ where: { id: current.id }, data: { branchId: branches[0].id } })
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: current.id, action: 'BRANCH_AUTO_ASSIGNED', entity: 'User', entityId: current.id, metadata: { branchId: branches[0].id, userId: current.id, automatic: true } } })
      return branches[0].id
    }
    if (branches.length > 1) return null
    let branchId: string
    try {
      const branch = await tx.branch.create({ data: { tenantId: session.user.tenantId, name: DEFAULT_BRANCH_NAME } })
      branchId = branch.id
    } catch (cause) {
      // Dos peticiones simultáneas pueden intentar crear la misma sucursal;
      // el índice único por nombre actúa como idempotencia.
      if (!(cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002')) throw cause
      const existing = await tx.branch.findFirst({ where: { tenantId: session.user.tenantId, name: DEFAULT_BRANCH_NAME, isActive: true }, select: { id: true } })
      if (!existing) throw cause
      branchId = existing.id
    }
    await tx.user.update({ where: { id: current.id }, data: { branchId } })
    await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: current.id, action: 'BRANCH_CREATED', entity: 'Branch', entityId: branchId, metadata: { branchId, userId: current.id, automatic: true } } })
    return branchId
  })
}
