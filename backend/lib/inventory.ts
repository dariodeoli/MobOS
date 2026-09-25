import type { Prisma } from '@prisma/client'

export const INVENTORY_REMOVED = 'INVENTORY_UNIT_REMOVED'
export const INVENTORY_RESTORED = 'INVENTORY_UNIT_RESTORED'
export const INVENTORY_RESERVED = 'INVENTORY_RESERVED'
export const INVENTORY_RESERVATION_RELEASED = 'INVENTORY_RESERVATION_RELEASED'
export const INVENTORY_RESERVATION_EXPIRED = 'INVENTORY_RESERVATION_EXPIRED'
export const INVENTORY_PHYSICALLY_VERIFIED = 'INVENTORY_PHYSICALLY_VERIFIED'
export const INVENTORY_UNIT_RECEIVED = 'INVENTORY_UNIT_RECEIVED'
export const INVENTORY_UNIT_MOVED = 'INVENTORY_UNIT_MOVED'
export const INVENTORY_UNIT_ADJUSTED = 'INVENTORY_UNIT_ADJUSTED'
export const INVENTORY_UNIT_DETAILS_UPDATED = 'INVENTORY_UNIT_DETAILS_UPDATED'
export const INVENTORY_TRANSIT_RECEIVED = 'INVENTORY_TRANSIT_RECEIVED'
// #240: el costo de una reparación del taller se pasó al costo real de la unidad.
export const INVENTORY_REPAIR_APPLIED = 'INVENTORY_REPAIR_APPLIED'

/**
 * Libera las reservas vencidas dejando rastro por unidad: la cronología de
 * cada equipo muestra que la reserva venció (con el cliente que la tenía) y no
 * solo que volvió a estar disponible. El barrido corre al listar inventario o
 * reservas; si no hay vencidas no escribe nada.
 */
export async function liberarReservasVencidas(tx: Prisma.TransactionClient, tenantId: string, ahora = new Date()) {
  const vencidas = await tx.inventoryUnit.findMany({
    where: { tenantId, status: 'RESERVED', reservedUntil: { lte: ahora } },
    select: { id: true, serial: true, reservationCustomer: true, reservedUntil: true },
    take: 200,
  })
  if (!vencidas.length) return 0
  await tx.inventoryUnit.updateMany({
    where: { id: { in: vencidas.map(unit => unit.id) }, tenantId, status: 'RESERVED' },
    data: { status: 'AVAILABLE', reservedUntil: null, reservationCustomer: null, reservationCustomerId: null, reservedById: null },
  })
  await tx.auditLog.createMany({
    data: vencidas.map(unit => ({
      tenantId,
      action: INVENTORY_RESERVATION_EXPIRED,
      entity: 'InventoryUnit',
      entityId: unit.id,
      metadata: { serial: unit.serial, customer: unit.reservationCustomer, reservedUntil: unit.reservedUntil?.toISOString() ?? null },
    })),
  })
  return vencidas.length
}

type InventoryAuditEvent = { entityId: string | null; action: string }

/**
 * La baja de inventario es lógica: la unidad física permanece para que un
 * administrador pueda restaurarla. El último evento gana, por lo que el
 * historial de auditoría no se sobrescribe ni se puede ocultar con un PATCH.
 */
export function removedInventoryUnitIds(events: InventoryAuditEvent[]) {
  const resolved = new Set<string>()
  const removed = new Set<string>()
  for (const event of events) {
    if (!event.entityId || resolved.has(event.entityId)) continue
    resolved.add(event.entityId)
    if (event.action === INVENTORY_REMOVED) removed.add(event.entityId)
  }
  return removed
}
