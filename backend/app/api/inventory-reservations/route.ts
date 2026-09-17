import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { serialKey } from '../../../lib/validation'

const MAX_MINUTES = 24 * 60

async function releaseExpired(tenant: string) {
  await prisma.inventoryUnit.updateMany({
    where: { tenantId: tenant, status: 'RESERVED', reservedUntil: { lte: new Date() } },
    data: { status: 'AVAILABLE', reservedUntil: null, reservationCustomer: null, reservedById: null },
  })
}

function branchAllowed(role: string, assigned: string | null, branchId: string | null) {
  return !['VENDEDOR', 'CAJERA'].includes(role) || assigned === branchId
}

export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  await releaseExpired(tenant)
  const branchId = new URL(request.url).searchParams.get('branchId')
  if (!branchAllowed(session.user.role, session.user.branchId, branchId)) return error('No autorizado para esa sucursal.', 403)
  return json(await prisma.inventoryUnit.findMany({ where: { tenantId: tenant, status: 'RESERVED', ...(branchId ? { branchId } : {}) }, include: { product: { select: { id: true, name: true, sku: true } }, branch: { select: { id: true, name: true } } }, orderBy: { reservedUntil: 'asc' }, take: 200 }))
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  let body: any; try { body = await request.json() } catch { return error('JSON inválido.') }
  const customer = typeof body.customerName === 'string' ? body.customerName.trim().slice(0, 200) : ''
  const minutes = Number(body.minutes)
  const raw = Array.isArray(body.serials) ? body.serials : []
  const serials = raw.map(serialKey).filter(Boolean)
  if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES || !serials.length || serials.length > 20 || new Set(serials).size !== serials.length) return error('Plazo de 1 a 1.440 minutos e IMEI/seriales únicos son obligatorios.')
  const until = new Date(Date.now() + minutes * 60000)
  try {
    const units = await prisma.$transaction(async tx => {
      await tx.inventoryUnit.updateMany({ where: { tenantId: tenant, status: 'RESERVED', reservedUntil: { lte: new Date() } }, data: { status: 'AVAILABLE', reservedUntil: null, reservationCustomer: null, reservedById: null } })
      const candidates = await tx.inventoryUnit.findMany({ where: { tenantId: tenant, serial: { in: serials }, status: 'AVAILABLE' }, select: { id: true, branchId: true } })
      if (candidates.length !== serials.length) throw new Error('Uno o más equipos ya no están disponibles.')
      if (candidates.some(unit => !branchAllowed(session.user.role, session.user.branchId, unit.branchId))) throw new Error('No autorizado para reservar equipos de otra sucursal.')
      const changed = await tx.inventoryUnit.updateMany({ where: { id: { in: candidates.map(unit => unit.id) }, tenantId: tenant, status: 'AVAILABLE' }, data: { status: 'RESERVED', reservedUntil: until, reservationCustomer: customer || null, reservedById: session.user.id } })
      if (changed.count !== candidates.length) throw new Error('El stock cambió mientras se reservaba.')
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_RESERVED', entity: 'InventoryUnit', metadata: { serials, customer, minutes, reservedUntil: until.toISOString() } } })
      return tx.inventoryUnit.findMany({ where: { id: { in: candidates.map(unit => unit.id) } }, include: { product: { select: { id: true, name: true, sku: true } }, branch: { select: { id: true, name: true } } } })
    })
    return json(units, { status: 201 })
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo reservar.', 409) }
}

export async function PATCH(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  let body: any; try { body = await request.json() } catch { return error('JSON inválido.') }
  const serials = (Array.isArray(body.serials) ? body.serials : []).map(serialKey).filter(Boolean)
  if (body.action !== 'release' || !serials.length || serials.length > 20 || new Set(serials).size !== serials.length) return error('Acción de liberación e IMEI/seriales únicos son obligatorios.')
  const where: any = { tenantId: tenant, serial: { in: serials }, status: 'RESERVED' }
  if (['VENDEDOR', 'CAJERA'].includes(session.user.role)) where.reservedById = session.user.id
  const released = await prisma.inventoryUnit.updateMany({ where, data: { status: 'AVAILABLE', reservedUntil: null, reservationCustomer: null, reservedById: null } })
  if (released.count !== serials.length) return error('No se pudieron liberar todos los equipos solicitados.', 409)
  await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_RESERVATION_RELEASED', entity: 'InventoryUnit', metadata: { serials } } })
  return json({ released: released.count })
}
