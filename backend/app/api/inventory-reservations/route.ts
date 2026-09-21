import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { serialKey } from '../../../lib/validation'
import { INVENTORY_RESERVED, INVENTORY_RESERVATION_RELEASED, liberarReservasVencidas } from '../../../lib/inventory'

const MAX_MINUTES = 24 * 60

// Campos que se limpian cuando la reserva termina (vencida, liberada o vendida).
const SIN_RESERVA = { reservedUntil: null, reservationCustomer: null, reservationCustomerId: null, reservedById: null }

function branchAllowed(role: string, assigned: string | null, branchId: string | null) {
  return !['VENDEDOR', 'CAJERA'].includes(role) || assigned === branchId
}

export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  // Al listar, las reservas vencidas vuelven a disponible con su evento de
  // cronología (la unidad muestra que la reserva venció).
  await prisma.$transaction(tx => liberarReservasVencidas(tx, tenant))
  const branchId = new URL(request.url).searchParams.get('branchId')
  if (!branchAllowed(session.user.role, session.user.branchId, branchId)) return error('No autorizado para esa sucursal.', 403)
  return json(await prisma.inventoryUnit.findMany({ where: { tenantId: tenant, status: 'RESERVED', ...(branchId ? { branchId } : {}) }, include: { product: { select: { id: true, name: true, sku: true, capacity: true } }, branch: { select: { id: true, name: true } }, reservationCustomerRef: { select: { id: true, name: true, phone: true, countryCode: true, document: true, email: true } } }, orderBy: { reservedUntil: 'asc' }, take: 200 }))
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  let body: any; try { body = await request.json() } catch { return error('JSON inválido.') }
  const customerName = typeof body.customerName === 'string' ? body.customerName.trim().slice(0, 200) : ''
  const customerId = typeof body.customerId === 'string' && body.customerId.trim() ? body.customerId.trim() : null
  const minutes = Number(body.minutes)
  const raw = Array.isArray(body.serials) ? body.serials : []
  const serials = raw.map(serialKey).filter(Boolean)
  if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES || !serials.length || serials.length > 20 || new Set(serials).size !== serials.length) return error('Plazo de 1 a 1.440 minutos e IMEI/seriales únicos son obligatorios.')
  const until = new Date(Date.now() + minutes * 60000)
  try {
    const units = await prisma.$transaction(async tx => {
      await liberarReservasVencidas(tx, tenant)
      // El cliente es opcional: la reserva puede quedar a nombre de una ficha
      // existente o sin cliente (mostrador). Nunca se crea una ficha acá.
      let cliente: { id: string; name: string } | null = null
      if (customerId) {
        cliente = await tx.customer.findFirst({ where: { id: customerId, tenantId: tenant }, select: { id: true, name: true } })
        if (!cliente) throw new Error('El cliente elegido no existe en esta tienda.')
      }
      const etiqueta = cliente?.name || customerName || 'Sin cliente'
      const candidates = await tx.inventoryUnit.findMany({ where: { tenantId: tenant, serial: { in: serials }, status: 'AVAILABLE' }, select: { id: true, serial: true, branchId: true } })
      if (candidates.length !== serials.length) throw new Error('Uno o más equipos ya no están disponibles.')
      if (candidates.some(unit => !branchAllowed(session.user.role, session.user.branchId, unit.branchId))) throw new Error('No autorizado para reservar equipos de otra sucursal.')
      const changed = await tx.inventoryUnit.updateMany({ where: { id: { in: candidates.map(unit => unit.id) }, tenantId: tenant, status: 'AVAILABLE' }, data: { status: 'RESERVED', reservedUntil: until, reservationCustomer: etiqueta, reservationCustomerId: cliente?.id ?? null, reservedById: session.user.id } })
      if (changed.count !== candidates.length) throw new Error('El stock cambió mientras se reservaba.')
      // Un evento por unidad: la cronología de cada equipo muestra para quién
      // quedó reservado y hasta cuándo, con el usuario que lo hizo.
      await tx.auditLog.createMany({
        data: candidates.map(unit => ({
          tenantId: tenant,
          userId: session.user.id,
          action: INVENTORY_RESERVED,
          entity: 'InventoryUnit',
          entityId: unit.id,
          metadata: { serial: unit.serial, customer: etiqueta, customerId: cliente?.id ?? null, minutes, reservedUntil: until.toISOString() },
        })),
      })
      return tx.inventoryUnit.findMany({ where: { id: { in: candidates.map(unit => unit.id) } }, include: { product: { select: { id: true, name: true, sku: true, capacity: true } }, branch: { select: { id: true, name: true } }, reservationCustomerRef: { select: { id: true, name: true, phone: true, countryCode: true, document: true, email: true } } } })
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
  const reservadas = await prisma.inventoryUnit.findMany({ where, select: { id: true, serial: true, reservationCustomer: true } })
  const released = await prisma.inventoryUnit.updateMany({ where: { id: { in: reservadas.map(unit => unit.id) }, tenantId: tenant, status: 'RESERVED' }, data: { status: 'AVAILABLE', ...SIN_RESERVA } })
  if (released.count !== serials.length) return error('No se pudieron liberar todos los equipos solicitados.', 409)
  await prisma.auditLog.createMany({
    data: reservadas.map(unit => ({
      tenantId: tenant,
      userId: session.user.id,
      action: INVENTORY_RESERVATION_RELEASED,
      entity: 'InventoryUnit',
      entityId: unit.id,
      metadata: { serial: unit.serial, customer: unit.reservationCustomer },
    })),
  })
  return json({ released: released.count })
}
