import { prisma } from '../../../../lib/prisma'
import { requireSession } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { InputError, objectInput, textInput } from '../../../../lib/payment-input'
import { parsePriceListItems, PriceListInputError } from '../../../../lib/price-lists'

type RouteContext = { params: { id: string } }

const priceListInclude = {
  items: { include: { tiers: { orderBy: { minQty: 'asc' as const } } } },
  _count: { select: { customers: true } },
}

const ROLES_GESTION = ['ADMIN', 'GERENTE']

async function listaDelTenant(tenantId: string, id: string) {
  return prisma.priceList.findFirst({ where: { id, tenantId }, select: { id: true } })
}

export async function GET(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const id = (params.id || '').trim().slice(0, 128)
  if (!id) return error('Lista obligatoria.')
  const lista = await prisma.priceList.findFirst({ where: { id, tenantId: session.user.tenantId }, include: priceListInclude })
  if (!lista) return error('Lista no encontrada.', 404)
  return json(lista)
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!ROLES_GESTION.includes(session.user.role)) return error('Solo administración o gerencia gestionan listas de precios.', 403)
  const id = (params.id || '').trim().slice(0, 128)
  if (!id || !await listaDelTenant(session.user.tenantId, id)) return error('Lista no encontrada.', 404)
  try {
    const body = objectInput(await request.json())
    const data: Record<string, unknown> = {}
    if (body.name !== undefined) data.name = textInput(body.name, 'Nombre', 120)
    if (body.currency !== undefined) {
      if (body.currency !== 'PYG' && body.currency !== 'USD') throw new InputError('La moneda debe ser PYG o USD.')
      data.currency = body.currency
    }
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') throw new InputError('isActive debe ser verdadero o falso.')
      data.isActive = body.isActive
    }
    const items = parsePriceListItems(body.items)
    if (items !== undefined) {
      const ids = items.filter(item => item.scope === 'PRODUCT').map(item => item.productId as string)
      const propios = ids.length ? await prisma.product.count({ where: { id: { in: [...new Set(ids)] }, tenantId: session.user.tenantId } }) : 0
      if (ids.length && propios !== new Set(ids).size) throw new InputError('Alguno de los productos no pertenece a la empresa.')
      data.items = { deleteMany: {}, create: items.map(item => ({ ...item, tiers: { create: item.tiers } })) }
    }
    if (!Object.keys(data).length) throw new InputError('No enviaste cambios.')
    const updated = await prisma.priceList.update({ where: { id }, data, include: priceListInclude })
    await prisma.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'PRICE_LIST_UPDATED', entity: 'PriceList', entityId: updated.id, metadata: { fields: Object.keys(data), items: items?.length } } })
    return json(updated)
  } catch (cause) {
    if (cause instanceof PriceListInputError || cause instanceof InputError) return error(cause.message, 400)
    return error('No se pudo actualizar la lista (¿ya existe otra con ese nombre?).', 409)
  }
}

// Baja lógica: la lista deja de aplicarse, pero se conserva para auditoría y
// para los clientes que la tengan asignada (pasan al precio de su ficha).
export async function DELETE(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!ROLES_GESTION.includes(session.user.role)) return error('Solo administración o gerencia gestionan listas de precios.', 403)
  const id = (params.id || '').trim().slice(0, 128)
  if (!id || !await listaDelTenant(session.user.tenantId, id)) return error('Lista no encontrada.', 404)
  const updated = await prisma.priceList.update({ where: { id }, data: { isActive: false } })
  await prisma.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'PRICE_LIST_DEACTIVATED', entity: 'PriceList', entityId: updated.id, metadata: { name: updated.name } } })
  return json({ id: updated.id, isActive: updated.isActive })
}
