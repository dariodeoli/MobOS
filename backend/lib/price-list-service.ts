import { PrismaClient } from '@prisma/client'
import { parsePriceListItems, validarReemplazoExplicito } from './price-lists'
import { hasPermission } from './auth'

export const PRICE_LIST_INCLUDE = {
  items: { include: { tiers: { orderBy: { minQty: 'asc' as const } } } },
  _count: { select: { customers: true } },
} as const

export type PriceListActor = { id: string; tenantId: string; role: string; permissions?: readonly string[] }
export class PriceListServiceError extends Error { constructor(public code: 'forbidden'|'not_found'|'invalid'|'conflict', message: string) { super(message) } }
const canManage = (actor: PriceListActor) => ['ADMIN', 'GERENTE'].includes(actor.role) || hasPermission({ permissions: [...(actor.permissions ?? [])] }, 'products:manage')
const canUpdate = (actor: PriceListActor) => ['ADMIN', 'GERENTE'].includes(actor.role)
function assertActor(actor: PriceListActor) { if (!canManage(actor)) throw new PriceListServiceError('forbidden', 'Solo administración o gerencia gestionan listas de precios.') }
function validateBody(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new PriceListServiceError('invalid', 'El cuerpo debe ser un objeto.')
  const value = body as Record<string, unknown>
  const name = value.name === undefined ? undefined : typeof value.name === 'string' && value.name.trim() ? value.name.trim() : null
  if (value.name !== undefined && !name) throw new PriceListServiceError('invalid', 'Nombre es obligatorio.')
  if (name && name.length > 120) throw new PriceListServiceError('invalid', 'Nombre no puede superar 120 caracteres.')
  if (value.isActive !== undefined && typeof value.isActive !== 'boolean') throw new PriceListServiceError('invalid', 'isActive debe ser verdadero o falso.')
  validarReemplazoExplicito(value)
  let items
  try { items = parsePriceListItems(value.items) } catch (error) { throw new PriceListServiceError('invalid', error instanceof Error ? error.message : 'Ítems inválidos.') }
  return { name: name ?? undefined, isActive: value.isActive as boolean | undefined, items }
}
async function assertProducts(db: any, tenantId: string, items: any[] | undefined) {
  const ids = (items ?? []).filter(item => item.scope === 'PRODUCT').map(item => item.productId as string)
  if (!ids.length) return
  const own = await db.product.count({ where: { id: { in: [...new Set(ids)] }, tenantId } })
  if (own !== new Set(ids).size) throw new PriceListServiceError('invalid', 'Alguno de los productos no pertenece a la empresa.')
}
export async function listPriceLists(db: PrismaClient | any, actor: PriceListActor, input: { q?: string; cursor?: string; limit?: number } = {}) {
  if (!['ADMIN', 'GERENTE'].includes(actor.role)) return { items: [], nextCursor: null }
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50)
  const q = input.q?.trim()
  const rows = await db.priceList.findMany({ where: { tenantId: actor.tenantId, ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}), ...(input.cursor ? { id: { gt: input.cursor } } : {}) }, include: PRICE_LIST_INCLUDE, orderBy: { id: 'asc' }, take: limit + 1 })
  const items = rows.length > limit ? rows.slice(0, limit) : rows
  return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null }
}
export async function readPriceList(db: PrismaClient | any, actor: PriceListActor, id: string) {
  if (!['ADMIN', 'GERENTE'].includes(actor.role)) throw new PriceListServiceError('forbidden', 'Solo administración o gerencia ven el detalle de las listas de precios.')
  const row = await db.priceList.findFirst({ where: { id, tenantId: actor.tenantId }, include: PRICE_LIST_INCLUDE })
  if (!row) throw new PriceListServiceError('not_found', 'Lista no encontrada.')
  return row
}
export async function createPriceList(db: PrismaClient | any, actor: PriceListActor, body: unknown) {
  assertActor(actor); const value = validateBody(body); if (!value.name) throw new PriceListServiceError('invalid', 'Nombre es obligatorio.')
  await assertProducts(db, actor.tenantId, value.items)
  try {
    const created = await db.priceList.create({ data: { tenantId: actor.tenantId, name: value.name, isActive: value.isActive ?? true, items: { create: (value.items ?? []).map(item => ({ ...item, tiers: { create: item.tiers } })) } }, include: PRICE_LIST_INCLUDE })
    await db.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.id, action: 'PRICE_LIST_CREATED', entity: 'PriceList', entityId: created.id, metadata: { name: created.name, items: value.items?.length ?? 0, source: 'shared-service' } } })
    return created
  } catch { throw new PriceListServiceError('conflict', 'No se pudo crear la lista (¿ya existe una con ese nombre?).') }
}
export async function updatePriceList(db: PrismaClient | any, actor: PriceListActor, id: string, body: unknown) {
  if (!canUpdate(actor)) throw new PriceListServiceError('forbidden', 'Solo administración o gerencia gestionan listas de precios.')
  const value = validateBody(body)
  const current = await db.priceList.findFirst({ where: { id, tenantId: actor.tenantId }, select: { id: true, updatedAt: true } }); if (!current) throw new PriceListServiceError('not_found', 'Lista no encontrada.')
  const expectedUpdatedAt = (body as Record<string, unknown>)._expectedUpdatedAt
  if (expectedUpdatedAt !== undefined && (typeof expectedUpdatedAt !== 'string' || current.updatedAt.toISOString() !== expectedUpdatedAt)) throw new PriceListServiceError('conflict', 'La lista cambió después de la vista previa; generá una nueva vista previa.')
  await assertProducts(db, actor.tenantId, value.items)
  const data: any = {}; if (value.name !== undefined) data.name = value.name; if (value.isActive !== undefined) data.isActive = value.isActive
  if (value.items !== undefined) data.items = { deleteMany: {}, create: value.items.map(item => ({ ...item, tiers: { create: item.tiers } })) }
  if (!Object.keys(data).length) return readPriceList(db, actor, id)
  try {
    const scalarData = Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'items'))
    // Prisma no ejecuta @updatedAt cuando no hay campos escalares. Los
    // reemplazos de ítems también deben avanzar la versión para invalidar previews anteriores.
    // Prisma's @updatedAt is not guaranteed to advance for item-only writes;
    // use a strictly newer version even when two commits share the same ms.
    scalarData.updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1))
    const claimed = await db.priceList.updateMany({ where: { id, tenantId: actor.tenantId, ...(expectedUpdatedAt ? { updatedAt: current.updatedAt } : {}) }, data: scalarData })
    if (claimed.count !== 1) throw new PriceListServiceError('conflict', 'La lista cambió después de la vista previa; generá una nueva vista previa.')
    if (value.items !== undefined) {
      await db.priceListItem.deleteMany({ where: { priceListId: id } })
      if (value.items.length) await db.priceListItem.createMany({ data: value.items.map(item => ({ priceListId: id, scope: item.scope, productId: item.productId, category: item.category, unitPricePyg: item.unitPricePyg, unitPriceUsd: item.unitPriceUsd, discountPct: item.discountPct })) })
      for (const item of value.items) {
        if (item.tiers.length) {
          const saved = await db.priceListItem.findFirst({ where: { priceListId: id, ...(item.productId ? { productId: item.productId } : { category: item.category }) }, select: { id: true } })
          if (saved) await db.priceTier.createMany({ data: item.tiers.map(tier => ({ priceListItemId: saved.id, minQty: tier.minQty, unitPricePyg: tier.unitPricePyg })) })
        }
      }
    }
    const updated = await readPriceList(db, actor, id)
    await db.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.id, action: 'PRICE_LIST_UPDATED', entity: 'PriceList', entityId: updated.id, metadata: { fields: Object.keys(data), items: value.items?.length, source: 'shared-service' } } })
    return updated
  } catch (error) { if (error instanceof PriceListServiceError) throw error; throw new PriceListServiceError('conflict', 'No se pudo actualizar la lista.') }
}
