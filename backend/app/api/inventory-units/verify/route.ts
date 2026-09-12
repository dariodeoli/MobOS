import { prisma } from '../../../../lib/prisma'
import { error, json, tenantId } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'

const serialKey = (value: unknown) => typeof value === 'string' ? value.trim().toUpperCase().replace(/[\s-]+/g, '').replace(/^MOBOS:/i, '') : ''
const branchAllowed = (role: string, assigned: string | null, branchId: string | null) => !['VENDEDOR', 'CAJERA'].includes(role) || assigned === branchId

// La verificación no mueve ni ajusta stock: deja evidencia de quién confirmó
// físicamente cada unidad y conserva el historial en AuditLog.
export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  let body: any; try { body = await request.json() } catch { return error('JSON inválido.') }
  const serials = (Array.isArray(body.serials) ? body.serials : [body.serial]).map(serialKey).filter(Boolean)
  if (!serials.length || serials.length > 100 || new Set(serials).size !== serials.length) return error('Indicá entre 1 y 100 IMEI/seriales distintos.')
  const now = new Date()
  try {
    const result = await prisma.$transaction(async tx => {
      const units = await tx.inventoryUnit.findMany({ where: { tenantId: tenant, serial: { in: serials }, status: { not: 'SOLD' } }, select: { id: true, serial: true, branchId: true, status: true } })
      if (units.length !== serials.length) throw new Error('Uno o más equipos no existen, ya fueron vendidos o no se pueden verificar.')
      if (units.some(unit => !branchAllowed(session.user.role, session.user.branchId, unit.branchId))) throw new Error('No autorizado para verificar equipos de otra sucursal.')
      await tx.inventoryUnit.updateMany({ where: { id: { in: units.map(unit => unit.id) }, tenantId: tenant }, data: { lastVerifiedAt: now, lastVerifiedById: session.user.id, verificationCount: { increment: 1 } } })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_PHYSICALLY_VERIFIED', entity: 'InventoryUnit', metadata: { serials: units.map(unit => unit.serial), verifiedAt: now.toISOString() } } })
      return { verified: units.length, verifiedAt: now.toISOString(), serials: units.map(unit => unit.serial) }
    })
    return json(result)
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo registrar la verificación.', 409) }
}
