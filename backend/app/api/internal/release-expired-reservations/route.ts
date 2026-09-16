import { timingSafeEqual } from 'node:crypto'
import { error, json } from '../../../../lib/http'
import { prisma } from '../../../../lib/prisma'
import { notifyReservationDue } from '../../../../lib/email-notifications'

function authorized(request: Request) {
  const expected = process.env.MOBOS_MAINTENANCE_TOKEN
  const actual = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  if (!expected || !actual) return false
  const left = Buffer.from(expected); const right = Buffer.from(actual)
  return left.length === right.length && timingSafeEqual(left, right)
}

// Called by the platform scheduler. It deliberately has no tenant supplied by
// the caller: expired reservations are released across every isolated tenant.
// Before releasing each reservation, its customer gets a "reservation due"
// notice when a matching customer record with an email exists.
export async function POST(request: Request) {
  if (!process.env.MOBOS_MAINTENANCE_TOKEN) return error('El mantenimiento programado todavía no está configurado.', 503)
  if (!authorized(request)) return error('No autorizado.', 401)
  const now = new Date()
  const expired = await prisma.inventoryUnit.findMany({
    where: { status: 'RESERVED', reservedUntil: { lte: now } },
    select: { id: true, tenantId: true, serial: true, reservationCustomer: true, reservedUntil: true, product: { select: { name: true } } },
  })
  if (!expired.length) return json({ released: 0, tenants: 0, checkedAt: now.toISOString() })
  const result = await prisma.$transaction(async tx => {
    for (const unit of expired) {
      const already = await tx.auditLog.findFirst({ where: { tenantId: unit.tenantId, action: 'RESERVATION_DUE_REMINDED', entity: 'InventoryUnit', entityId: unit.id }, select: { id: true } })
      if (already) continue
      const sent = await notifyReservationDue(tx, {
        tenantId: unit.tenantId,
        unitId: unit.id,
        customerName: unit.reservationCustomer ?? '',
        itemLabel: unit.product ? `${unit.product.name} (${unit.serial})` : unit.serial,
        reservedUntil: unit.reservedUntil as Date,
      })
      if (sent) await tx.auditLog.create({ data: { tenantId: unit.tenantId, action: 'RESERVATION_DUE_REMINDED', entity: 'InventoryUnit', entityId: unit.id, metadata: { reservedUntil: unit.reservedUntil?.toISOString() ?? null } } })
    }
    const ids = expired.map(unit => unit.id)
    const released = await tx.inventoryUnit.updateMany({ where: { id: { in: ids }, status: 'RESERVED', reservedUntil: { lte: now } }, data: { status: 'AVAILABLE', reservedUntil: null, reservationCustomer: null, reservedById: null } })
    const counts = new Map<string, number>()
    expired.forEach(({ tenantId }) => counts.set(tenantId, (counts.get(tenantId) || 0) + 1))
    await Promise.all([...counts.entries()].map(([tenantId, count]) => tx.auditLog.create({ data: { tenantId, action: 'INVENTORY_RESERVATIONS_RELEASED_SCHEDULED', entity: 'InventoryUnit', metadata: { count, checkedAt: now.toISOString() } } })))
    return { released: released.count, tenants: counts.size }
  })
  return json({ ...result, checkedAt: now.toISOString() })
}
