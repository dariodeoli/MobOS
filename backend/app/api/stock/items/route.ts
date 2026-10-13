import { Prisma } from '@prisma/client'
import { prisma } from '../../../../lib/prisma'
import { error, json, tenantId } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { canSeeCost as puedeVerCosto } from '../../../../lib/cost-visibility'
import { sucursalEfectiva } from '../../../../lib/sucursal-efectiva'
import { buildStockItemsPageSql, buildStockItemsTotalsSql, buildStockTotals, mapStockRow, paginateStockRows, parseStockItemsQuery } from '../../../../lib/stock-items'

type RawRow = Record<string, unknown>
type TotalRow = { kind: string; stockKind: string; status: string; count: number }

// Lista unificada de Stock: unidades (una fila por IMEI) + productos sin
// unidades (una fila por producto). Cursor estable, totales con los mismos
// filtros y como máximo 2 consultas de datos por página (más la sesión).
export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const role = session.user.role
  const restricted = ['VENDEDOR', 'CAJERA'].includes(role)
  const canSeeCost = puedeVerCosto(role)

  const parsed = parseStockItemsQuery(new URL(request.url).searchParams)
  if ('error' in parsed) return error(parsed.error)
  const { filters, cursor } = parsed
  // El filtro por proveedor revelaría a qué proveedor pertenece cada unidad.
  if (filters.supplierId && !canSeeCost) return error('No autorizado.', 403)

  // VENDEDOR/CAJERA quedan acotados a su sucursal efectiva (#286), igual que en Unidades.
  const effective = restricted ? await sucursalEfectiva(session) : null
  if (restricted && filters.branchId && filters.branchId !== effective) return error('No autorizado para esa sucursal.', 403)
  const empty = { items: [], nextCursor: null, hasMore: false, limit: filters.limit, totals: { total: 0, byStatus: {}, byKind: {}, byRowKind: {} } }
  if (restricted && !effective) return json(empty)

  const scope = { tenantId: tenant, forcedBranchId: restricted ? effective : null, canSeeCost, canSeeRemoved: role === 'ADMIN' }
  const pageSql = buildStockItemsPageSql(filters, scope, cursor)
  const totalsSql = buildStockItemsTotalsSql(filters, scope)
  if (!pageSql || !totalsSql) return json(empty)

  const [rows, totalRows] = await Promise.all([
    prisma.$queryRaw<RawRow[]>(pageSql as Prisma.Sql),
    prisma.$queryRaw<TotalRow[]>(totalsSql as Prisma.Sql),
  ])
  const { page, hasMore, nextCursor } = paginateStockRows(rows, filters.limit)
  return json({ items: page.map(row => mapStockRow(row, canSeeCost)), nextCursor, hasMore, limit: filters.limit, totals: buildStockTotals(totalRows) })
}
