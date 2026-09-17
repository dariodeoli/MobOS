import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

const INT_MAX = 2147483647
const safeInt = (value: unknown, min = 0) => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= INT_MAX
const text = (value: unknown, max = 200) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null

type ComboItem = { productId: string; quantity: number }

function normalizeItems(raw: unknown): ComboItem[] {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 20) throw new Error('El combo necesita entre 2 y 20 componentes.')
  const items: ComboItem[] = []
  const seen = new Set<string>()
  for (const row of raw) {
    const item = row && typeof row === 'object' ? row as Record<string, unknown> : {}
    const productId = typeof item.productId === 'string' ? item.productId : ''
    const quantity = Number(item.quantity)
    if (!productId || !safeInt(quantity, 1) || seen.has(productId)) throw new Error('Cada componente debe tener producto único y cantidad válida.')
    seen.add(productId)
    items.push({ productId, quantity })
  }
  return items
}

export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const all = new URL(request.url).searchParams.get('all') === '1' && ['ADMIN', 'GERENTE'].includes(session.user.role)
  const combos = await prisma.combo.findMany({ where: { tenantId: tenant, ...(all ? {} : { isActive: true }) }, orderBy: { name: 'asc' }, take: 200 })
  return json(combos)
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE'].includes(session.user.role)) return error('No autorizado.', 403)
  let body: any; try { body = await request.json() } catch { return error('JSON inválido.') }
  const name = text(body?.name, 200); const price = Number(body?.pricePyg)
  if (!name) return error('El nombre del combo es obligatorio.')
  if (!safeInt(price, 1)) return error('El precio del combo debe ser un entero positivo.')
  try {
    const items = normalizeItems(body?.items)
    const products = await prisma.product.findMany({ where: { tenantId: tenant, id: { in: items.map(item => item.productId) } }, select: { id: true } })
    if (products.length !== items.length) return error('Algún componente no pertenece a esta empresa.', 404)
    const combo = await prisma.combo.create({ data: { tenantId: tenant, branchId: session.user.branchId, name, pricePyg: price, items } })
    await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'COMBO_CREATED', entity: 'Combo', entityId: combo.id, metadata: { name, pricePyg: price, items } } })
    return json(combo, { status: 201 })
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo crear el combo.', 400) }
}

export async function PATCH(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE'].includes(session.user.role)) return error('No autorizado.', 403)
  let body: any; try { body = await request.json() } catch { return error('JSON inválido.') }
  const id = text(body?.id, 128)
  if (!id) return error('Combo obligatorio.')
  const combo = await prisma.combo.findFirst({ where: { id, tenantId: tenant } })
  if (!combo) return error('Combo no encontrado.', 404)
  try {
    const items = body?.items === undefined ? undefined : normalizeItems(body.items)
    const price = body?.pricePyg === undefined ? undefined : Number(body.pricePyg)
    if (price !== undefined && !safeInt(price, 1)) return error('Precio inválido.')
    const updated = await prisma.combo.update({ where: { id }, data: {
      ...(body?.name !== undefined ? { name: text(body.name, 200) || combo.name } : {}),
      ...(price !== undefined ? { pricePyg: price } : {}),
      ...(items !== undefined ? { items } : {}),
      ...(typeof body?.isActive === 'boolean' ? { isActive: body.isActive } : {}),
    } })
    await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'COMBO_UPDATED', entity: 'Combo', entityId: id, metadata: { isActive: updated.isActive } } })
    return json(updated)
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo actualizar el combo.', 409) }
}
