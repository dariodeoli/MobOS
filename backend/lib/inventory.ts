import { Prisma } from '@prisma/client'

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
 * reservas; si no hay vencidas no escribe nada. El vencimiento se compara con
 * el reloj de Postgres (no el de la app). Las retenciones del carrito
 * (CART_HOLD) también se sueltan, sin rastro por unidad: son de 5 minutos.
 * Con `productId` el barrido se acota a ese producto (lecturas del POS).
 */
export async function liberarReservasVencidas(tx: Prisma.TransactionClient, tenantId: string, opciones: { productId?: string } = {}) {
  const { productId } = opciones
  const vencidas = await tx.$queryRaw<Array<{ id: string; serial: string; reservationCustomer: string | null; reservedUntil: Date | null; reservationKind: string | null }>>`
    SELECT "id", "serial", "reservationCustomer", ("reservedUntil" AT TIME ZONE 'UTC') AS "reservedUntil", "reservationKind"::text AS "reservationKind" FROM "InventoryUnit"
    WHERE "tenantId" = ${tenantId} AND "status" = 'RESERVED' AND "reservedUntil" <= (now() AT TIME ZONE 'UTC')
      ${productId ? Prisma.sql`AND "productId" = ${productId}` : Prisma.empty}
    LIMIT 200`
  if (!vencidas.length) return 0
  const liberadas = await tx.$queryRaw<Array<{ id: string }>>`
    UPDATE "InventoryUnit" SET "status" = 'AVAILABLE', "reservedUntil" = NULL, "reservationCustomer" = NULL, "reservationCustomerId" = NULL, "reservedById" = NULL,
      "reservationKind" = NULL, "holdCartId" = NULL, "holdDeviceId" = NULL, "holdStartedAt" = NULL, "updatedAt" = (now() AT TIME ZONE 'UTC')
    WHERE "id" IN (${Prisma.join(vencidas.map(unit => unit.id))}) AND "tenantId" = ${tenantId} AND "status" = 'RESERVED' AND "reservedUntil" <= (now() AT TIME ZONE 'UTC')
    RETURNING "id"`
  const ids = new Set(liberadas.map(unit => unit.id))
  const conRastro = vencidas.filter(unit => ids.has(unit.id) && unit.reservationKind !== 'CART_HOLD')
  if (conRastro.length) {
    await tx.auditLog.createMany({
      data: conRastro.map(unit => ({
        tenantId,
        action: INVENTORY_RESERVATION_EXPIRED,
        entity: 'InventoryUnit',
        entityId: unit.id,
        metadata: { serial: unit.serial, customer: unit.reservationCustomer, reservedUntil: unit.reservedUntil?.toISOString() ?? null },
      })),
    })
  }
  return liberadas.length
}

/**
 * Campos de la baja recuperable. Se escriben en el mismo update (y la misma
 * transacción) que el AuditLog INVENTORY_UNIT_REMOVED: el campo es la fuente
 * de lectura y la auditoría sigue siendo el rastro.
 */
export function removalFields(userId: string | null, reason: string | null, at = new Date()) {
  return { removedAt: at, removedById: userId, removedReason: reason }
}

/** Restaurar limpia la baja (el INVENTORY_UNIT_RESTORED queda en la auditoría). */
export function restoreFields() {
  return { removedAt: null, removedById: null, removedReason: null }
}

type InventoryAuditEvent = { entityId: string | null; action: string }

/**
 * La baja de inventario es lógica: la unidad física permanece para que un
 * administrador pueda restaurarla. El último evento gana, por lo que el
 * historial de auditoría no se sobrescribe ni se puede ocultar con un PATCH.
 */
// Conjunto de bajas derivado SOLO de la auditoría: lo usa el chequeo de
// consistencia para compararlo contra InventoryUnit.removedAt.
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
