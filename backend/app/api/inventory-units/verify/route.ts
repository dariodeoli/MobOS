import { prisma } from '../../../../lib/prisma'
import { error, json, tenantId } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'

const serialKey = (value: unknown) => typeof value === 'string' ? value.trim().toUpperCase().replace(/[\s-]+/g, '').replace(/^MOBOS:/i, '') : ''
const branchAllowed = (role: string, assigned: string | null, branchId: string | null) => !['VENDEDOR', 'CAJERA'].includes(role) || assigned === branchId
const text = (value: unknown, max = 128) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null

// La verificación deja evidencia de quién confirmó físicamente cada unidad.
// Cuando la unidad viene en tránsito, el check del vendedor/encargado en destino
// es además la recepción: la unidad pasa a disponible, se asigna a una ubicación
// (Depósito 1, Depósito 2, Piso de venta…) y recién ahí suma al stock del local.
export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  let body: any; try { body = await request.json() } catch { return error('JSON inválido.') }
  const serials = (Array.isArray(body.serials) ? body.serials : [body.serial]).map(serialKey).filter(Boolean)
  if (!serials.length || serials.length > 100 || new Set(serials).size !== serials.length) return error('Indicá entre 1 y 100 IMEI/seriales distintos.')
  const locationId = body.locationId === undefined || body.locationId === null || body.locationId === '' ? null : text(body.locationId)
  if (body.locationId !== undefined && body.locationId !== null && body.locationId !== '' && !locationId) return error('Ubicación inválida.')
  if (locationId && serials.length > 1) return error('Para asignar ubicación, verificá una sola unidad por vez.')
  const now = new Date()
  try {
    const result = await prisma.$transaction(async tx => {
      const units = await tx.inventoryUnit.findMany({ where: { tenantId: tenant, serial: { in: serials }, status: { not: 'SOLD' } }, select: { id: true, serial: true, branchId: true, status: true, productId: true } })
      if (units.length !== serials.length) throw new Error('Uno o más equipos no existen, ya fueron vendidos o no se pueden verificar.')
      if (units.some(unit => !branchAllowed(session.user.role, session.user.branchId, unit.branchId))) throw new Error('No autorizado para verificar equipos de otra sucursal.')
      let received = 0
      for (const unit of units) {
        if (locationId && !(await tx.stockLocation.findFirst({ where: { id: locationId, tenantId: tenant, branchId: unit.branchId ?? undefined, isActive: true }, select: { id: true } }))) throw new Error('Ubicación no encontrada para la sucursal del equipo.')
        const arriving = unit.status === 'IN_TRANSIT'
        await tx.inventoryUnit.update({ where: { id: unit.id }, data: {
          lastVerifiedAt: now, lastVerifiedById: session.user.id, verificationCount: { increment: 1 },
          ...(arriving ? { status: 'AVAILABLE', locationId: locationId ?? null, reservedUntil: null, reservationCustomer: null, reservedById: null } : locationId ? { locationId } : {}),
        } })
        if (arriving) {
          received += 1
          const incremented = await tx.product.updateMany({ where: { id: unit.productId, tenantId: tenant, stock: { lt: 2147483647 } }, data: { stock: { increment: 1 } } })
          if (incremented.count !== 1) throw new Error('El stock cambió mientras se recibía el equipo.')
          await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_TRANSIT_RECEIVED', entity: 'InventoryUnit', entityId: unit.id, metadata: { serial: unit.serial, branchId: unit.branchId, locationId } } })
        }
      }
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_PHYSICALLY_VERIFIED', entity: 'InventoryUnit', metadata: { serials: units.map(unit => unit.serial), verifiedAt: now.toISOString(), receivedInTransit: received, locationId } } })
      return { verified: units.length, receivedInTransit: received, verifiedAt: now.toISOString(), serials: units.map(unit => unit.serial) }
    })
    return json(result)
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo registrar la verificación.', 409) }
}
