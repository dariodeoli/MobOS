import { Prisma } from '@prisma/client'
import { isStockKind, type StockKind } from './stock-kind'
import { serialKey } from './validation'
import { parseUnitCode } from './unit-code'

// U2 · Lista unificada de Stock: unidades serializadas (una fila por IMEI) más
// productos sin unidades (una fila por producto) en una sola consulta con
// paginación por cursor estable. Las partes puras (parseo de filtros, cursor,
// SQL, redacción) viven acá para probarlas sin base; la ruta solo resuelve
// sesión, alcance de sucursal y ejecuta.

export const STOCK_ITEM_STATUSES = ['disponible', 'reservado', 'vendido', 'defectuoso', 'en_transito', 'eliminado'] as const
export type StockItemStatus = typeof STOCK_ITEM_STATUSES[number]
export type StockRowKind = 'unit' | 'product'

export const STOCK_ITEMS_DEFAULT_LIMIT = 50
export const STOCK_ITEMS_MAX_LIMIT = 200

const STATUS_TO_UNIT: Record<Exclude<StockItemStatus, 'eliminado'>, string> = {
  disponible: 'AVAILABLE', reservado: 'RESERVED', vendido: 'SOLD', defectuoso: 'DEFECTIVE', en_transito: 'IN_TRANSIT',
}

export type StockItemsFilters = {
  rowKind: StockRowKind | null
  stockKind: StockKind | null
  status: StockItemStatus | null
  branchId: string | null
  supplierId: string | null
  locationId: string | null
  productId: string | null
  q: string
  from: Date | null
  // Cota superior exclusiva: una fecha sola («2026-10-13») incluye todo ese día.
  toExclusive: Date | null
  limit: number
}

export type StockItemsScope = {
  tenantId: string
  // Sucursal impuesta por el rol (VENDEDOR/CAJERA); null = sin restricción.
  forcedBranchId: string | null
  canSeeCost: boolean
  // Nombre real del proveedor: solo ADMIN/GERENTE (#400). El resto recibe la sigla.
  canSeeSupplier: boolean
  canSeeRemoved: boolean
}

export type StockItemsCursor = { sortKey: string; id: string }

export type StockItem = {
  id: string
  kind: StockRowKind
  stockKind: StockKind
  productId: string
  sku: string
  model: string
  name: string
  serial: string | null
  // NEW/USED/… de la unidad; null en filas de producto. Lo usa el orden por condición.
  condition: string | null
  batteryHealth: number | null
  supplierId: string | null
  // Nombre real para gerencia; para el resto, la sigla («S/S» si no tiene).
  supplierName: string | null
  supplierCode: string | null
  consignorName: string | null
  // Planilla de Unidades (#400). Solo en filas de unidad; null en productos.
  supplierIcon: string | null
  supplierColor: string | null
  batteryCycles: number | null
  warrantyUntil: Date | string | null
  notes: string | null
  reservedUntil: Date | string | null
  reservationCustomer: string | null
  // Quién verificó: código de verificación física (VPC…) o, si falta, el nombre del usuario.
  verifiedBy: string | null
  lastVerifiedAt: Date | string | null
  // Quién verificó, como persona (para el avatar de la planilla, #466). Sin permiso extra: es el mismo dato que `verifiedBy`.
  verifiedById: string | null
  verifiedByName: string | null
  // Nota de venta (#466): número del pedido que vendió la unidad y si ya se entregó. Solo en «vendido».
  soldOrderNumber: string | null
  soldDelivered: boolean | null
  locationCode: string | null
  locationIcon: string | null
  locationColor: string | null
  costPyg: number | null
  status: StockItemStatus
  quantity: number
  branchId: string | null
  branchName: string | null
  locationId: string | null
  locationName: string | null
  createdAt: Date | string
  soldAt: Date | string | null
}

// ── Cursor ───────────────────────────────────────────────────────────────────
// (sortKey, id): createdAt (soldAt en «vendido») nunca cambia por una edición,
// así que las páginas no se corren cuando se toca updatedAt.
export function encodeStockCursor(cursor: { sortKey: Date | string; id: string }): string {
  const sortKey = cursor.sortKey instanceof Date ? cursor.sortKey.toISOString() : new Date(cursor.sortKey).toISOString()
  return Buffer.from(JSON.stringify([sortKey, cursor.id]), 'utf8').toString('base64url')
}

export function decodeStockCursor(value: string | null | undefined): StockItemsCursor | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (!Array.isArray(parsed) || parsed.length !== 2) return null
    const [sortKey, id] = parsed
    if (typeof sortKey !== 'string' || typeof id !== 'string' || !id || id.length > 128) return null
    const date = new Date(sortKey)
    if (Number.isNaN(date.getTime())) return null
    return { sortKey: date.toISOString(), id }
  } catch { return null }
}

// ── Filtros ──────────────────────────────────────────────────────────────────
const SHORT_ID = (value: string | null, max = 128) => (value || '').trim().slice(0, max) || null

function parseDate(value: string | null, endOfRange: boolean): Date | null | 'invalid' {
  const text = (value || '').trim()
  if (!text) return null
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text)
  const date = new Date(dateOnly ? `${text}T00:00:00.000Z` : text)
  if (Number.isNaN(date.getTime())) return 'invalid'
  if (!endOfRange) return date
  return new Date(date.getTime() + (dateOnly ? 86400000 : 1))
}

export function parseStockItemsQuery(params: URLSearchParams): { filters: StockItemsFilters; cursor: StockItemsCursor | null } | { error: string } {
  // `kind` acepta la forma de fila (unit|product) o, por comodidad, un tipo de stock.
  const kindParam = (params.get('kind') || '').trim()
  let rowKind: StockRowKind | null = null
  let stockKind: StockKind | null = null
  if (kindParam) {
    if (kindParam === 'unit' || kindParam === 'product') rowKind = kindParam
    else if (isStockKind(kindParam.toUpperCase())) stockKind = kindParam.toUpperCase() as StockKind
    else return { error: 'Tipo de fila inválido.' }
  }
  const stockKindParam = (params.get('stockKind') || '').trim().toUpperCase()
  if (stockKindParam) {
    if (!isStockKind(stockKindParam)) return { error: 'Tipo de stock inválido.' }
    stockKind = stockKindParam
  }
  const statusParam = (params.get('status') || '').trim()
  if (statusParam && !(STOCK_ITEM_STATUSES as readonly string[]).includes(statusParam)) return { error: 'Estado de stock inválido.' }
  const from = parseDate(params.get('from'), false)
  const to = parseDate(params.get('to'), true)
  if (from === 'invalid' || to === 'invalid') return { error: 'Fecha inválida.' }
  const rawLimit = Number(params.get('limit'))
  const limit = Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.min(STOCK_ITEMS_MAX_LIMIT, Math.floor(rawLimit)) : STOCK_ITEMS_DEFAULT_LIMIT
  const cursorParam = params.get('cursor')
  const cursor = decodeStockCursor(cursorParam)
  if (cursorParam && !cursor) return { error: 'Cursor inválido.' }
  return {
    cursor,
    filters: {
      rowKind, stockKind,
      status: (statusParam || null) as StockItemStatus | null,
      branchId: SHORT_ID(params.get('branchId')),
      supplierId: SHORT_ID(params.get('supplierId')),
      locationId: SHORT_ID(params.get('locationId')),
      productId: SHORT_ID(params.get('productId')),
      q: (params.get('q') || '').trim().slice(0, 120),
      from, toExclusive: to, limit,
    },
  }
}

const likeEscape = (value: string) => value.replace(/[\\%_]/g, char => `\\${char}`)

// ── SQL ──────────────────────────────────────────────────────────────────────
type Mode = 'page' | 'count'

function sortKeyFor(filters: StockItemsFilters, column: Prisma.Sql) {
  return filters.status === 'vendido' ? Prisma.sql`COALESCE(u."soldAt", u."createdAt")` : column
}

/** soldAt es timestamp UTC sin zona; el archivo diario usa el día comercial paraguayo. */
export function soldVisibleOnBusinessDaySql(soldAt: Prisma.Sql, now: Prisma.Sql = Prisma.sql`NOW()`): Prisma.Sql {
  return Prisma.sql`(${soldAt} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Asuncion')::date >= (${now} AT TIME ZONE 'America/Asuncion')::date`
}

function unitsBranch(filters: StockItemsFilters, scope: StockItemsScope, cursor: StockItemsCursor | null, mode: Mode): Prisma.Sql | null {
  if (filters.rowKind === 'product') return null
  const t = scope.tenantId
  const sortKey = sortKeyFor(filters, Prisma.sql`u."createdAt"`)
  const unitStockKind = Prisma.sql`COALESCE(p."stockKind"::text, 'EQUIPO')`
  const statusExpr = Prisma.sql`CASE WHEN u."removedAt" IS NOT NULL THEN 'eliminado' WHEN u."status" = 'AVAILABLE' THEN 'disponible' WHEN u."status" = 'RESERVED' AND u."reservationKind" = 'CART_HOLD' THEN 'disponible' WHEN u."status" = 'RESERVED' THEN 'reservado' WHEN u."status" = 'SOLD' THEN 'vendido' WHEN u."status" = 'DEFECTIVE' THEN 'defectuoso' WHEN u."status" = 'IN_TRANSIT' THEN 'en_transito' ELSE u."status"::text END`
  const where: Prisma.Sql[] = [Prisma.sql`u."tenantId" = ${t}`, Prisma.sql`p."tenantId" = ${t}`]
  // Estado: sobre columnas crudas para aprovechar los índices.
  if (filters.status === 'eliminado') {
    if (!scope.canSeeRemoved) return null
    where.push(Prisma.sql`u."removedAt" IS NOT NULL`)
  } else {
    where.push(Prisma.sql`u."removedAt" IS NULL`)
    if (filters.status) {
      // Una retención de carrito (CART_HOLD) no es una reserva de cliente: para Stock la unidad sigue «disponible».
      const retenida = Prisma.sql`u."reservationKind" = 'CART_HOLD'`
      if (STATUS_TO_UNIT[filters.status] === 'RESERVED') where.push(Prisma.sql`(u."status"::text = 'RESERVED' AND (u."reservationKind" IS NULL OR NOT ${retenida}))`)
      else if (STATUS_TO_UNIT[filters.status] === 'AVAILABLE') where.push(Prisma.sql`(u."status"::text = 'AVAILABLE' OR (u."status"::text = 'RESERVED' AND ${retenida}))`)
      else where.push(Prisma.sql`u."status"::text = ${STATUS_TO_UNIT[filters.status]}`)
    }
    // Sin estado elegido (#466): lo vendido sale solo el día de la venta (día de la tienda, Asunción);
    // al día siguiente queda únicamente en la vista «Vendidos».
    else where.push(Prisma.sql`(u."status"::text <> 'SOLD' OR ${soldVisibleOnBusinessDaySql(Prisma.sql`u."soldAt"`)})`)
  }
  const branch = scope.forcedBranchId ?? filters.branchId
  if (scope.forcedBranchId && filters.branchId && filters.branchId !== scope.forcedBranchId) return null
  if (branch) where.push(Prisma.sql`u."branchId" = ${branch}`)
  if (filters.supplierId) where.push(Prisma.sql`u."supplierId" = ${filters.supplierId}`)
  if (filters.locationId) where.push(Prisma.sql`u."locationId" = ${filters.locationId}`)
  if (filters.productId) where.push(Prisma.sql`u."productId" = ${filters.productId}`)
  if (filters.stockKind) where.push(Prisma.sql`${unitStockKind} = ${filters.stockKind}`)
  if (filters.q) {
    const raw = filters.q.replace(/^MOBOS:/i, '')
    const normalized = serialKey(raw)
    const rawLike = `%${likeEscape(raw)}%`
    const serialLike = `%${likeEscape(normalized || raw)}%`
    // Código interno (MOV-0042): coincide por el correlativo de la empresa.
    const unitCode = parseUnitCode(raw)
    where.push(Prisma.sql`(u."serial" ILIKE ${serialLike} OR p."sku" ILIKE ${rawLike} OR p."sku" ILIKE ${serialLike} OR p."name" ILIKE ${rawLike} OR u."notes" ILIKE ${rawLike} OR EXISTS (SELECT 1 FROM "Supplier" sq WHERE sq."id" = u."supplierId" AND sq."code" ILIKE ${rawLike})${unitCode ? Prisma.sql` OR u."internalSeq" = ${unitCode.seq}` : Prisma.empty})`)
  }
  if (filters.from) where.push(Prisma.sql`${sortKey} >= ${filters.from.toISOString()}::timestamp`)
  if (filters.toExclusive) where.push(Prisma.sql`${sortKey} < ${filters.toExclusive.toISOString()}::timestamp`)
  if (mode === 'page' && cursor) where.push(Prisma.sql`(${sortKey}, u."id") < (${cursor.sortKey}::timestamp, ${cursor.id})`)
  const whereSql = Prisma.join(where, ' AND ')

  if (mode === 'count') {
    return Prisma.sql`SELECT 'unit'::text AS "kind", ${unitStockKind} AS "stockKind", ${statusExpr} AS "status"
      FROM "InventoryUnit" u JOIN "Product" p ON p."id" = u."productId" WHERE ${whereSql}`
  }
  const cost = scope.canSeeCost
  return Prisma.sql`(SELECT 'unit'::text AS "kind", u."id" AS "id", ${unitStockKind} AS "stockKind", p."id" AS "productId", p."sku" AS "sku",
      NULLIF(btrim(concat_ws(' ', p."model", p."capacity", p."color")), '') AS "model", p."name" AS "name",
      u."serial" AS "serial", u."condition"::text AS "condition", u."batteryHealth" AS "batteryHealth",
      ${cost ? Prisma.sql`u."supplierId"` : Prisma.sql`NULL::text`} AS "supplierId",
      ${scope.canSeeSupplier ? Prisma.sql`COALESCE(s."name", u."supplierName")` : Prisma.sql`NULL::text`} AS "supplierName",
      CASE WHEN u."supplierId" IS NULL AND u."supplierName" IS NULL THEN NULL ELSE COALESCE(NULLIF(btrim(s."code"), ''), 'S/S') END AS "supplierCode",
      ${cost ? Prisma.sql`u."consignorName"` : Prisma.sql`NULL::text`} AS "consignorName",
      s."icon" AS "supplierIcon", s."color" AS "supplierColor", u."batteryCycles" AS "batteryCycles", u."warrantyUntil" AS "warrantyUntil", u."notes" AS "notes",
      u."reservedUntil" AS "reservedUntil", u."reservationCustomer" AS "reservationCustomer",
      COALESCE(NULLIF(btrim(u."verifiedByCode"), ''), vu."name") AS "verifiedBy", u."lastVerifiedAt" AS "lastVerifiedAt",
      u."lastVerifiedById" AS "verifiedById", vu."name" AS "verifiedByName",
      so."orderNumber" AS "soldOrderNumber", CASE WHEN so."id" IS NULL THEN NULL ELSE so."fulfillmentStatus"::text IN ('DELIVERED', 'PICKED_UP') END AS "soldDelivered",
      l."code" AS "locationCode", l."icon" AS "locationIcon", l."color" AS "locationColor",
      ${cost ? Prisma.sql`u."costPyg"` : Prisma.sql`NULL::bigint`} AS "costPyg",
      ${statusExpr} AS "status", 1 AS "quantity",
      u."branchId" AS "branchId", b."name" AS "branchName", u."locationId" AS "locationId", l."name" AS "locationName",
      u."createdAt" AS "createdAt", u."soldAt" AS "soldAt", ${sortKey} AS "sortKey"
    FROM "InventoryUnit" u
    JOIN "Product" p ON p."id" = u."productId"
    LEFT JOIN "Branch" b ON b."id" = u."branchId"
    LEFT JOIN "StockLocation" l ON l."id" = u."locationId"
    LEFT JOIN "Supplier" s ON s."id" = u."supplierId"
    LEFT JOIN "User" vu ON vu."id" = u."lastVerifiedById"
    LEFT JOIN "OrderItem" soi ON soi."id" = u."soldOrderItemId"
    LEFT JOIN "Order" so ON so."id" = soi."orderId" AND so."tenantId" = u."tenantId"
    WHERE ${whereSql}
    ORDER BY "sortKey" DESC, "id" DESC LIMIT ${filters.limit + 1})`
}

function productsBranch(filters: StockItemsFilters, scope: StockItemsScope, cursor: StockItemsCursor | null, mode: Mode): Prisma.Sql | null {
  if (filters.rowKind === 'unit') return null
  // Los productos no tienen proveedor/ubicación por fila: esos filtros no los alcanzan.
  if (filters.supplierId || filters.locationId) return null
  if (filters.stockKind === 'EQUIPO') return null
  if (filters.status && filters.status !== 'disponible' && filters.status !== 'vendido') return null
  const t = scope.tenantId
  const vendido = filters.status === 'vendido'
  const productStockKind = Prisma.sql`COALESCE(p."stockKind"::text, 'OTRO')`
  const sortKey = vendido ? Prisma.sql`sold."last"` : Prisma.sql`p."createdAt"`
  const where: Prisma.Sql[] = [
    Prisma.sql`p."tenantId" = ${t}`, Prisma.sql`p."isActive" = true`, Prisma.sql`${productStockKind} <> 'EQUIPO'`,
    Prisma.sql`NOT EXISTS (SELECT 1 FROM "InventoryUnit" iu WHERE iu."tenantId" = ${t} AND iu."productId" = p."id")`,
  ]
  const branch = scope.forcedBranchId ?? filters.branchId
  if (scope.forcedBranchId && filters.branchId && filters.branchId !== scope.forcedBranchId) return null
  if (branch) where.push(Prisma.sql`p."branchId" = ${branch}`)
  if (filters.productId) where.push(Prisma.sql`p."id" = ${filters.productId}`)
  if (filters.stockKind) where.push(Prisma.sql`${productStockKind} = ${filters.stockKind}`)
  if (filters.q) {
    const raw = filters.q.replace(/^MOBOS:/i, '')
    const normalized = serialKey(raw)
    const rawLike = `%${likeEscape(raw)}%`
    const normalizedLike = `%${likeEscape(normalized || raw)}%`
    where.push(Prisma.sql`(p."sku" ILIKE ${rawLike} OR p."sku" ILIKE ${normalizedLike} OR p."name" ILIKE ${rawLike})`)
  }
  // En «vendido» el rango filtra las ventas sumadas; en el resto, la fecha de alta.
  if (!vendido) {
    if (filters.from) where.push(Prisma.sql`p."createdAt" >= ${filters.from.toISOString()}::timestamp`)
    if (filters.toExclusive) where.push(Prisma.sql`p."createdAt" < ${filters.toExclusive.toISOString()}::timestamp`)
  }
  if (mode === 'page' && cursor) where.push(Prisma.sql`(${sortKey}, p."id") < (${cursor.sortKey}::timestamp, ${cursor.id})`)
  const whereSql = Prisma.join(where, ' AND ')
  const soldRange: Prisma.Sql[] = [Prisma.sql`o."tenantId" = ${t}`, Prisma.sql`o."status"::text IN ('COMPLETED', 'PENDING')`]
  // Lista explícita (no «<> CANCELLED»): una venta a crédito o sin cobrar ya dejó la unidad en SOLD, así que cuenta igual que ella.
  if (branch) soldRange.push(Prisma.sql`o."branchId" = ${branch}`)
  if (filters.from) soldRange.push(Prisma.sql`o."createdAt" >= ${filters.from.toISOString()}::timestamp`)
  if (filters.toExclusive) soldRange.push(Prisma.sql`o."createdAt" < ${filters.toExclusive.toISOString()}::timestamp`)
  const soldJoin = vendido
    ? Prisma.sql`JOIN LATERAL (SELECT COALESCE(SUM(oi."quantity"), 0)::int AS "qty", MAX(o."createdAt") AS "last"
        FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId"
        WHERE oi."productId" = p."id" AND ${Prisma.join(soldRange, ' AND ')}) sold ON sold."qty" > 0`
    : Prisma.empty
  const statusExpr = vendido ? Prisma.sql`'vendido'` : Prisma.sql`'disponible'`

  if (mode === 'count') {
    return Prisma.sql`SELECT 'product'::text AS "kind", ${productStockKind} AS "stockKind", ${statusExpr}::text AS "status"
      FROM "Product" p ${soldJoin} WHERE ${whereSql}`
  }
  return Prisma.sql`(SELECT 'product'::text AS "kind", p."id" AS "id", ${productStockKind} AS "stockKind", p."id" AS "productId", p."sku" AS "sku",
      NULLIF(btrim(concat_ws(' ', p."model", p."capacity", p."color")), '') AS "model", p."name" AS "name",
      NULL::text AS "serial", NULL::text AS "condition", NULL::int AS "batteryHealth", NULL::text AS "supplierId", NULL::text AS "supplierName", NULL::text AS "supplierCode", NULL::text AS "consignorName",
      NULL::text AS "supplierIcon", NULL::text AS "supplierColor", NULL::int AS "batteryCycles", NULL::timestamp(3) AS "warrantyUntil", NULL::text AS "notes",
      NULL::timestamp(3) AS "reservedUntil", NULL::text AS "reservationCustomer", NULL::text AS "verifiedBy", NULL::timestamp(3) AS "lastVerifiedAt", NULL::text AS "verifiedById", NULL::text AS "verifiedByName",
      NULL::text AS "soldOrderNumber", NULL::boolean AS "soldDelivered",
      NULL::text AS "locationCode", NULL::text AS "locationIcon", NULL::text AS "locationColor",
      ${scope.canSeeCost ? Prisma.sql`p."costPyg"` : Prisma.sql`NULL::bigint`} AS "costPyg",
      ${statusExpr}::text AS "status", ${vendido ? Prisma.sql`sold."qty"` : Prisma.sql`GREATEST(p."stock", 0)`}::int AS "quantity",
      p."branchId" AS "branchId", b."name" AS "branchName", NULL::text AS "locationId", NULL::text AS "locationName",
      p."createdAt" AS "createdAt", ${vendido ? Prisma.sql`sold."last"` : Prisma.sql`NULL::timestamp(3)`} AS "soldAt", ${sortKey} AS "sortKey"
    FROM "Product" p
    LEFT JOIN "Branch" b ON b."id" = p."branchId"
    ${soldJoin}
    WHERE ${whereSql}
    ORDER BY "sortKey" DESC, "id" DESC LIMIT ${filters.limit + 1})`
}

function unionOf(branches: Array<Prisma.Sql | null>): Prisma.Sql | null {
  const present = branches.filter((branch): branch is Prisma.Sql => branch !== null)
  return present.length ? Prisma.join(present, ' UNION ALL ') : null
}

/** Página: cada rama ya filtrada y recortada a limit+1; el exterior ordena y corta. null = ninguna rama aplica. */
export function buildStockItemsPageSql(filters: StockItemsFilters, scope: StockItemsScope, cursor: StockItemsCursor | null): Prisma.Sql | null {
  const union = unionOf([unitsBranch(filters, scope, cursor, 'page'), productsBranch(filters, scope, cursor, 'page')])
  return union && Prisma.sql`SELECT * FROM (${union}) page ORDER BY "sortKey" DESC, "id" DESC LIMIT ${filters.limit + 1}`
}

/** Totales con los mismos filtros (sin cursor ni límite): una sola consulta agrupada. */
export function buildStockItemsTotalsSql(filters: StockItemsFilters, scope: StockItemsScope): Prisma.Sql | null {
  const union = unionOf([unitsBranch(filters, scope, null, 'count'), productsBranch(filters, scope, null, 'count')])
  return union && Prisma.sql`SELECT "kind", "stockKind", "status", COUNT(*)::int AS "count" FROM (${union}) rows GROUP BY "kind", "stockKind", "status"`
}

// ── Mapeo y redacción ────────────────────────────────────────────────────────
type RawRow = Record<string, unknown> & { sortKey?: Date | string }

const toNumber = (value: unknown) => value === null || value === undefined ? null : Number(value)

/**
 * Última barrera: sin permiso de costos no sale costo, id de proveedor ni consignación;
 * sin permiso de ver el nombre del proveedor solo sale su sigla (#400).
 */
export function redactStockItem<T extends { costPyg: unknown; supplierId: unknown; supplierName: unknown; supplierCode?: unknown; consignorName?: unknown }>(item: T, canSeeCost: boolean, canSeeSupplier: boolean): T {
  const out: Record<string, unknown> = { ...item }
  if (!canSeeCost) Object.assign(out, { costPyg: null, supplierId: null, consignorName: null })
  if (!canSeeSupplier) out.supplierName = typeof item.supplierCode === 'string' ? item.supplierCode : null
  return out as T
}

export function mapStockRow(row: RawRow, canSeeCost: boolean, canSeeSupplier: boolean): StockItem {
  return redactStockItem({
    id: String(row.id), kind: row.kind as StockRowKind, stockKind: row.stockKind as StockKind, productId: String(row.productId),
    sku: String(row.sku ?? ''), model: String(row.model ?? ''), name: String(row.name ?? ''),
    serial: (row.serial as string | null) ?? null, condition: (row.condition as string | null) ?? null, batteryHealth: toNumber(row.batteryHealth),
    supplierId: (row.supplierId as string | null) ?? null, supplierName: (row.supplierName as string | null) ?? null, supplierCode: (row.supplierCode as string | null) ?? null,
    consignorName: (row.consignorName as string | null) ?? null,
    supplierIcon: (row.supplierIcon as string | null) ?? null, supplierColor: (row.supplierColor as string | null) ?? null,
    batteryCycles: toNumber(row.batteryCycles), warrantyUntil: (row.warrantyUntil as Date | string | null) ?? null, notes: (row.notes as string | null) ?? null,
    reservedUntil: (row.reservedUntil as Date | string | null) ?? null, reservationCustomer: (row.reservationCustomer as string | null) ?? null,
    verifiedBy: (row.verifiedBy as string | null) ?? null, lastVerifiedAt: (row.lastVerifiedAt as Date | string | null) ?? null,
    verifiedById: (row.verifiedById as string | null) ?? null, verifiedByName: (row.verifiedByName as string | null) ?? null,
    soldOrderNumber: (row.soldOrderNumber as string | null) ?? null, soldDelivered: row.soldDelivered === null || row.soldDelivered === undefined ? null : Boolean(row.soldDelivered),
    locationCode: (row.locationCode as string | null) ?? null, locationIcon: (row.locationIcon as string | null) ?? null, locationColor: (row.locationColor as string | null) ?? null,
    costPyg: toNumber(row.costPyg), status: row.status as StockItemStatus, quantity: Number(row.quantity),
    branchId: (row.branchId as string | null) ?? null, branchName: (row.branchName as string | null) ?? null,
    locationId: (row.locationId as string | null) ?? null, locationName: (row.locationName as string | null) ?? null,
    createdAt: row.createdAt as Date | string, soldAt: (row.soldAt as Date | string | null) ?? null,
  }, canSeeCost, canSeeSupplier)
}

export function buildStockTotals(rows: Array<{ kind: string; stockKind: string; status: string; count: number }>) {
  const byStatus: Record<string, number> = {}
  const byKind: Record<string, number> = {}
  const byRowKind: Record<string, number> = {}
  let total = 0
  for (const row of rows) {
    const count = Number(row.count)
    total += count
    byStatus[row.status] = (byStatus[row.status] ?? 0) + count
    byKind[row.stockKind] = (byKind[row.stockKind] ?? 0) + count
    byRowKind[row.kind] = (byRowKind[row.kind] ?? 0) + count
  }
  return { total, byStatus, byKind, byRowKind }
}

/** Corta limit+1 filas a la página y arma el cursor de la siguiente. */
export function paginateStockRows(rows: RawRow[], limit: number) {
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page[page.length - 1]
  return { page, hasMore, nextCursor: hasMore && last?.sortKey ? encodeStockCursor({ sortKey: last.sortKey, id: String(last.id) }) : null }
}

// Redacción de unidades: vive en cost-visibility (una sola regla para todas las rutas).
export { redactUnitCosts } from './cost-visibility'
