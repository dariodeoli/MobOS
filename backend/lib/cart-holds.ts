import { Prisma } from '@prisma/client'

/**
 * Retención de IMEI en el carrito del POS (CART_HOLD).
 *
 * La fila de la unidad es el candado: cada operación es UN UPDATE condicional
 * en SQL crudo y TODA comparación de vencimiento usa el reloj de Postgres
 * (nunca el de la app ni el del celular). Bajo READ COMMITTED, el segundo
 * UPDATE concurrente espera el bloqueo de fila, reevalúa el WHERE y obtiene
 * 0 filas. Las columnas son `timestamp` sin zona guardadas en UTC por Prisma,
 * por eso el reloj se compara siempre como `now() AT TIME ZONE 'UTC'`.
 */
export const HOLD_SECONDS = 5 * 60
export const HOLD_MAX_MINUTES = 60
export const HOLD_MAX_PER_SELLER = 10
export const INVENTORY_CART_HOLD_CREATED = 'INVENTORY_CART_HOLD_CREATED'
export const INVENTORY_CART_HOLD_RELEASED = 'INVENTORY_CART_HOLD_RELEASED'
export const INVENTORY_CART_HOLD_CONVERTED = 'INVENTORY_CART_HOLD_CONVERTED'
export const INVENTORY_CART_HOLD_EXPIRED = 'INVENTORY_CART_HOLD_EXPIRED'
export const CART_HOLD_RELEASED_BY_MANAGER = 'CART_HOLD_RELEASED_BY_MANAGER'

type Tx = Prisma.TransactionClient

/** Reloj de Postgres en la misma convención de las columnas (UTC sin zona). */
export const NOW_UTC = Prisma.raw(`(now() AT TIME ZONE 'UTC')`)
const CLOCK_UTC = Prisma.raw(`(clock_timestamp() AT TIME ZONE 'UTC')`)
const HOLD_SECS = Prisma.raw(String(HOLD_SECONDS))
const HOLD_MAX_MINS = Prisma.raw(String(HOLD_MAX_MINUTES))

export class HoldError extends Error {
  constructor(message: string, public status: number, public details?: Record<string, unknown>) { super(message) }
}

// Los instantes salen de SQL ya formateados (ISO en UTC): el controlador no tiene que
// adivinar la zona de un `timestamp` sin zona (leerlo como hora local corría el contador 3 h).
const ISO_FORMAT = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`
const ISO = (columna: string) => Prisma.raw(`to_char(${columna}, ${ISO_FORMAT})`)

/** Reloj de Postgres (instante exacto, no el inicio de la transacción) como ISO UTC. */
export async function serverNow(tx: Tx): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ now: string }>>`SELECT ${ISO(`(clock_timestamp() AT TIME ZONE 'UTC')`)} AS now`
  return rows[0].now
}

export type HoldConflict = { serial: string; reason: 'NOT_FOUND' | 'UNAVAILABLE' | 'HELD'; holderName: string | null; holderId: string | null; secondsLeft: number | null; mine: boolean }

/** Detalle de por qué un serial no se pudo retener (quién la tiene y cuánto le queda). */
export async function conflictsFor(tx: Tx, tenant: string, branchId: string, userId: string, serials: string[]): Promise<HoldConflict[]> {
  if (!serials.length) return []
  const rows = await tx.$queryRaw<Array<{ serial: string; status: string; kind: string | null; branchId: string | null; holderId: string | null; holderName: string | null; secondsLeft: number | null }>>`
    SELECT u."serial", u."status"::text AS status, u."reservationKind"::text AS kind, u."branchId", u."reservedById" AS "holderId", r."name" AS "holderName",
           CASE WHEN u."reservedUntil" IS NULL THEN NULL ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (u."reservedUntil" - ${CLOCK_UTC}))))::int END AS "secondsLeft"
    FROM "InventoryUnit" u LEFT JOIN "User" r ON r."id" = u."reservedById"
    WHERE u."tenantId" = ${tenant} AND u."serial" IN (${Prisma.join(serials)})`
  const byS = new Map(rows.map(row => [row.serial, row]))
  return serials.map(serial => {
    const row = byS.get(serial)
    if (!row || row.branchId !== branchId) return { serial, reason: 'NOT_FOUND' as const, holderName: null, holderId: null, secondsLeft: null, mine: false }
    if (row.status === 'RESERVED') {
      return { serial, reason: 'HELD' as const, holderName: row.kind === 'CART_HOLD' ? row.holderName : (row.holderName || 'una reserva de cliente'), holderId: row.holderId, secondsLeft: row.secondsLeft, mine: row.holderId === userId }
    }
    return { serial, reason: 'UNAVAILABLE' as const, holderName: null, holderId: null, secondsLeft: null, mine: false }
  })
}

export function conflictMessage(conflict: HoldConflict) {
  if (conflict.reason === 'HELD') {
    const left = conflict.secondsLeft ?? 0
    const reloj = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
    return conflict.mine ? 'Ya lo tenés apartado en otro carrito.' : `Retenida por ${conflict.holderName || 'otro vendedor'} · ${reloj}`
  }
  if (conflict.reason === 'NOT_FOUND') return 'Ese equipo no está en tu sucursal.'
  return 'Ese equipo ya no está disponible.'
}

/** Retenciones vivas del vendedor (reloj de Postgres). */
export async function activeHoldCount(tx: Tx, tenant: string, userId: string, exceptSerials: string[] = []) {
  const rows = await tx.$queryRaw<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n FROM "InventoryUnit"
    WHERE "tenantId" = ${tenant} AND "reservedById" = ${userId} AND "status" = 'RESERVED' AND "reservationKind" = 'CART_HOLD' AND "reservedUntil" > ${NOW_UTC}
    ${exceptSerials.length ? Prisma.sql`AND "serial" NOT IN (${Prisma.join(exceptSerials)})` : Prisma.empty}`
  return rows[0]?.n ?? 0
}

export type HeldUnit = { id: string; serial: string; reservedUntil: string; holdStartedAt: string }

/**
 * Crear o renovar (idempotente) la retención de `serials` para un carrito.
 * Todo o nada: si alguno no se puede retener, lanza HoldError 409 con el
 * detalle (la transacción del llamador se revierte y no quedan retenciones a medias).
 */
export async function holdUnits(tx: Tx, input: { tenant: string; branchId: string; userId: string; cartId: string; deviceId: string | null; serials: string[] }) {
  const { tenant, branchId, userId, cartId, deviceId, serials } = input
  const otras = await activeHoldCount(tx, tenant, userId, serials)
  if (otras + serials.length > HOLD_MAX_PER_SELLER) throw new HoldError(`Ya tenés ${HOLD_MAX_PER_SELLER} equipos apartados: vendé o liberá alguno antes de apartar otro.`, 422, { max: HOLD_MAX_PER_SELLER })
  // Las que ya eran mías en este carrito son renovaciones (no se vuelven a auditar).
  const previas = await tx.$queryRaw<Array<{ serial: string }>>`
    SELECT "serial" FROM "InventoryUnit"
    WHERE "tenantId" = ${tenant} AND "serial" IN (${Prisma.join(serials)}) AND "status" = 'RESERVED' AND "reservationKind" = 'CART_HOLD' AND "holdCartId" = ${cartId} AND "reservedById" = ${userId} AND "reservedUntil" > ${NOW_UTC}`
  const propias = new Set(previas.map(row => row.serial))
  const held = await tx.$queryRaw<HeldUnit[]>`
    UPDATE "InventoryUnit" SET
      "status" = 'RESERVED', "reservationKind" = 'CART_HOLD',
      "reservedUntil" = ${NOW_UTC} + make_interval(secs => ${HOLD_SECS}),
      "reservedById" = ${userId}, "reservationCustomer" = NULL, "reservationCustomerId" = NULL,
      "holdCartId" = ${cartId}, "holdDeviceId" = ${deviceId},
      "holdStartedAt" = CASE WHEN "status" = 'RESERVED' AND "holdCartId" = ${cartId} AND "reservedById" = ${userId} AND "reservedUntil" > ${NOW_UTC} AND "holdStartedAt" IS NOT NULL THEN "holdStartedAt" ELSE ${NOW_UTC} END,
      "updatedAt" = ${NOW_UTC}
    WHERE "tenantId" = ${tenant} AND "branchId" = ${branchId} AND "removedAt" IS NULL AND "serial" IN (${Prisma.join(serials)})
      AND ("status" = 'AVAILABLE'
        OR ("status" = 'RESERVED' AND "reservationKind" = 'CART_HOLD' AND "reservedUntil" <= ${NOW_UTC})
        OR ("status" = 'RESERVED' AND "reservationKind" = 'CART_HOLD' AND "holdCartId" = ${cartId} AND "reservedById" = ${userId}))
    RETURNING "id", "serial", ${ISO('"reservedUntil"')} AS "reservedUntil", ${ISO('"holdStartedAt"')} AS "holdStartedAt"`
  if (held.length !== serials.length) {
    const ok = new Set(held.map(unit => unit.serial))
    const conflicts = await conflictsFor(tx, tenant, branchId, userId, serials.filter(serial => !ok.has(serial)))
    throw new HoldError(conflicts[0] ? conflictMessage(conflicts[0]) : 'No se pudo apartar el equipo.', 409, { conflicts })
  }
  const creadas = held.filter(unit => !propias.has(unit.serial))
  if (creadas.length) {
    await tx.auditLog.createMany({ data: creadas.map(unit => ({ tenantId: tenant, userId, action: INVENTORY_CART_HOLD_CREATED, entity: 'InventoryUnit', entityId: unit.id, metadata: { serial: unit.serial, cartId, deviceId } })) })
  }
  return held
}

/** Latido: extiende las retenciones vivas del carrito sin superar el tope absoluto desde `holdStartedAt`. */
export async function renewHolds(tx: Tx, input: { tenant: string; userId: string; cartId: string; serials?: string[] }) {
  const { tenant, userId, cartId, serials } = input
  const filtro = serials?.length ? Prisma.sql`AND "serial" IN (${Prisma.join(serials)})` : Prisma.empty
  return tx.$queryRaw<Array<HeldUnit & { capped: boolean }>>`
    UPDATE "InventoryUnit" SET
      "reservedUntil" = GREATEST("reservedUntil", LEAST(${NOW_UTC} + make_interval(secs => ${HOLD_SECS}), "holdStartedAt" + make_interval(mins => ${HOLD_MAX_MINS}))),
      "updatedAt" = ${NOW_UTC}
    WHERE "tenantId" = ${tenant} AND "holdCartId" = ${cartId} AND "reservedById" = ${userId} AND "status" = 'RESERVED' AND "reservationKind" = 'CART_HOLD'
      AND "reservedUntil" > ${NOW_UTC} AND "holdStartedAt" IS NOT NULL ${filtro}
    RETURNING "id", "serial", ${ISO('"reservedUntil"')} AS "reservedUntil", ${ISO('"holdStartedAt"')} AS "holdStartedAt", ("holdStartedAt" + make_interval(mins => ${HOLD_MAX_MINS}) <= "reservedUntil") AS "capped"`
}

const LIBRE = Prisma.raw(`"status" = 'AVAILABLE', "reservationKind" = NULL, "reservedUntil" = NULL, "reservationCustomer" = NULL, "reservationCustomerId" = NULL, "reservedById" = NULL, "holdCartId" = NULL, "holdDeviceId" = NULL, "holdStartedAt" = NULL, "updatedAt" = (now() AT TIME ZONE 'UTC')`)

/**
 * Liberar retenciones (idempotente). Las propias: por carrito y/o seriales.
 * Las de otros solo con `canReleaseOthers` (stock:manage), dejando AuditLog
 * CART_HOLD_RELEASED_BY_MANAGER. Devuelve cuántas se liberaron realmente.
 */
export async function releaseHolds(tx: Tx, input: { tenant: string; userId: string; cartId?: string | null; serials?: string[]; canReleaseOthers: boolean; branchScope?: string | null }) {
  const { tenant, userId, cartId, serials, canReleaseOthers, branchScope } = input
  const filtroSerial = serials?.length ? Prisma.sql`AND "serial" IN (${Prisma.join(serials)})` : Prisma.empty
  const mias = await tx.$queryRaw<Array<{ id: string; serial: string }>>`
    UPDATE "InventoryUnit" SET ${LIBRE}
    WHERE "tenantId" = ${tenant} AND "status" = 'RESERVED' AND "reservationKind" = 'CART_HOLD' AND "reservedById" = ${userId}
      ${cartId ? Prisma.sql`AND "holdCartId" = ${cartId}` : Prisma.empty} ${filtroSerial}
    RETURNING "id", "serial"`
  if (mias.length) {
    await tx.auditLog.createMany({ data: mias.map(unit => ({ tenantId: tenant, userId, action: INVENTORY_CART_HOLD_RELEASED, entity: 'InventoryUnit', entityId: unit.id, metadata: { serial: unit.serial, cartId: cartId ?? null } })) })
  }
  let ajenas: Array<{ id: string; serial: string; holder: string | null }> = []
  if (serials?.length) {
    const quedan = serials.filter(serial => !mias.some(unit => unit.serial === serial))
    if (quedan.length) {
      const otras = await tx.$queryRaw<Array<{ id: string; serial: string; holder: string | null; branchId: string | null }>>`
        SELECT "id", "serial", "reservedById" AS holder, "branchId" FROM "InventoryUnit"
        WHERE "tenantId" = ${tenant} AND "serial" IN (${Prisma.join(quedan)}) AND "status" = 'RESERVED' AND "reservationKind" = 'CART_HOLD' AND "reservedUntil" > ${NOW_UTC}`
      if (otras.length) {
        if (!canReleaseOthers || (branchScope && otras.some(unit => unit.branchId !== branchScope))) throw new HoldError('Solo gerencia puede liberar un equipo retenido por otro vendedor.', 403)
        const liberadas = await tx.$queryRaw<Array<{ id: string; serial: string }>>`
          UPDATE "InventoryUnit" SET ${LIBRE}
          WHERE "id" IN (${Prisma.join(otras.map(unit => unit.id))}) AND "tenantId" = ${tenant} AND "status" = 'RESERVED' AND "reservationKind" = 'CART_HOLD'
          RETURNING "id", "serial"`
        const porId = new Map(otras.map(unit => [unit.id, unit.holder]))
        ajenas = liberadas.map(unit => ({ ...unit, holder: porId.get(unit.id) ?? null }))
        if (ajenas.length) {
          await tx.auditLog.createMany({ data: ajenas.map(unit => ({ tenantId: tenant, userId, action: CART_HOLD_RELEASED_BY_MANAGER, entity: 'InventoryUnit', entityId: unit.id, metadata: { serial: unit.serial, heldBy: unit.holder } })) })
        }
      }
    }
  }
  return { released: mias.length + ajenas.length, own: mias.length, others: ajenas.length }
}

/**
 * Suelta las retenciones de carrito vencidas (de una empresa, de un producto y
 * sucursal, o de todas). Sin aviso al cliente: no son reservas suyas.
 * `audit` solo para barridos acotados (el masivo diario no audita cada una).
 */
export async function expireCartHolds(tx: Tx, input: { tenant?: string; productId?: string; branchId?: string; audit?: boolean }) {
  const { tenant, productId, branchId, audit = false } = input
  const vencidas = await tx.$queryRaw<Array<{ id: string; tenantId: string; serial: string }>>`
    UPDATE "InventoryUnit" SET ${LIBRE}
    WHERE "status" = 'RESERVED' AND "reservationKind" = 'CART_HOLD' AND "reservedUntil" <= ${NOW_UTC}
      ${tenant ? Prisma.sql`AND "tenantId" = ${tenant}` : Prisma.empty} ${productId ? Prisma.sql`AND "productId" = ${productId}` : Prisma.empty} ${branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty}
    RETURNING "id", "tenantId", "serial"`
  if (audit && vencidas.length) {
    await tx.auditLog.createMany({ data: vencidas.map(unit => ({ tenantId: unit.tenantId, action: INVENTORY_CART_HOLD_EXPIRED, entity: 'InventoryUnit', entityId: unit.id, metadata: { serial: unit.serial } })) })
  }
  return vencidas
}
