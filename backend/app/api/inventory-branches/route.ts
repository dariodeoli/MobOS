import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

// Fuente mínima para los selectores de inventario. Nunca expone empresas ajenas.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const restricted = ['VENDEDOR', 'CAJERA'].includes(session.user.role)
  return json(await prisma.branch.findMany({
    where: { tenantId: session.user.tenantId, isActive: true, ...(restricted ? { id: session.user.branchId ?? '__none__' } : {}) },
    select: { id: true, name: true, city: true }, orderBy: { name: 'asc' },
  }))
}
