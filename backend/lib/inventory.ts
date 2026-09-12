export const INVENTORY_REMOVED = 'INVENTORY_UNIT_REMOVED'
export const INVENTORY_RESTORED = 'INVENTORY_UNIT_RESTORED'

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
