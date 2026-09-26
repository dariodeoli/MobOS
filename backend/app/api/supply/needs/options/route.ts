import { prisma } from '../../../../../lib/prisma'
import { error, json, tenantId } from '../../../../../lib/http'
import { canAccessAny, effectivePermissions, requireSession } from '../../../../../lib/auth'
import { NECESIDAD_CENTROS, NECESIDAD_CENTRO_LABEL } from '../../../../../lib/supply-demand'

// #250 F1 · Opciones del panel «Por comprar»: con qué cuenta el comprador para
// asignar. Devuelve los compradores (usuarios con acceso a stock), los centros
// del plan + los ya usados y las sucursales activas.
export async function GET(request: Request) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  if (!canAccessAny(session.user, ['stock:manage'])) return error('No autorizado.', 403)

  const [usuarios, usados, sucursales] = await Promise.all([
    prisma.user.findMany({ where: { tenantId: tenant, status: 'ACTIVE' }, select: { id: true, name: true, role: true, permissions: true }, orderBy: { name: 'asc' }, take: 200 }),
    prisma.supplyNeed.findMany({ where: { tenantId: tenant, origin: { not: null } }, select: { origin: true }, distinct: ['origin'], take: 50 }),
    prisma.branch.findMany({ where: { tenantId: tenant, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 200 }),
  ])

  const compradores = usuarios
    .filter((usuario) => {
      const permisos = effectivePermissions(usuario.role, usuario.permissions)
      return permisos.includes('*') || permisos.includes('stock:manage')
    })
    .map((usuario) => ({ id: usuario.id, name: usuario.name, role: usuario.role }))
  const centros = [...new Set([...NECESIDAD_CENTROS, ...usados.map((fila) => String(fila.origin || '').toUpperCase()).filter(Boolean)])]
    .map((centro) => ({ centro, label: NECESIDAD_CENTRO_LABEL[centro] || centro }))

  return json({ compradores, centros, sucursales })
}
