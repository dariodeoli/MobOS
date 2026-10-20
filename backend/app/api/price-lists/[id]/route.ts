import { prisma } from '../../../../lib/prisma'
import { requireSession } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { InputError, objectInput, textInput } from '../../../../lib/payment-input'
import { PricingError } from '../../../../lib/pricing'
import { parsePriceListItems, PriceListInputError, validarReemplazoExplicito } from '../../../../lib/price-lists'
import { updatePriceList, PriceListServiceError, readPriceList } from '../../../../lib/price-list-service'

type RouteContext = { params: Promise<{ id: string }> }

const priceListInclude = {
  items: { include: { tiers: { orderBy: { minQty: 'asc' as const } } } },
  _count: { select: { customers: true } },
}

const ROLES_GESTION = ['ADMIN', 'GERENTE']

async function listaDelTenant(tenantId: string, id: string) {
  return prisma.priceList.findFirst({ where: { id, tenantId }, select: { id: true } })
}

// El detalle de una lista (categorías y precios) es información comercial
// sensible: solo ADMIN/GERENTE. El vendedor resuelve precios por /api/pricing.
export async function GET(request: Request, props: RouteContext) {
  const params = await props.params;
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!ROLES_GESTION.includes(session.user.role)) return error('Solo administración o gerencia ven el detalle de las listas de precios.', 403)
  const id = (params.id || '').trim().slice(0, 128)
  if (!id) return error('Lista obligatoria.')
  try { return json(await readPriceList(prisma, { id: session.user.id, tenantId: session.user.tenantId, role: session.user.role, permissions: session.user.permissions }, id)) }
  catch (cause) { if (cause instanceof PriceListServiceError) return error(cause.message, cause.code === 'not_found' ? 404 : 403); throw cause }
}

export async function PATCH(request: Request, props: RouteContext) {
  const params = await props.params;
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!ROLES_GESTION.includes(session.user.role)) return error('Solo administración o gerencia gestionan listas de precios.', 403)
  const id = (params.id || '').trim().slice(0, 128)
  if (!id) return error('Lista no encontrada.', 404)
  try {
    const body = objectInput(await request.json())
    const updated = await updatePriceList(prisma, { id: session.user.id, tenantId: session.user.tenantId, role: session.user.role, permissions: session.user.permissions }, id, body)
    return json(updated)
  } catch (cause) {
    if (cause instanceof PriceListServiceError) return error(cause.message, cause.code === 'forbidden' ? 403 : cause.code === 'not_found' ? 404 : cause.code === 'conflict' ? 409 : 400)
    if (cause instanceof PriceListInputError || cause instanceof PricingError || cause instanceof InputError) return error(cause.message, 400)
    return error('No se pudo actualizar la lista (¿ya existe otra con ese nombre?).', 409)
  }
}

// Baja lógica: la lista deja de aplicarse, pero se conserva para auditoría y
// para los clientes que la tengan asignada (pasan al precio de su ficha).
export async function DELETE(request: Request, props: RouteContext) {
  const params = await props.params;
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!ROLES_GESTION.includes(session.user.role)) return error('Solo administración o gerencia gestionan listas de precios.', 403)
  const id = (params.id || '').trim().slice(0, 128)
  if (!id || !(await listaDelTenant(session.user.tenantId, id))) return error('Lista no encontrada.', 404)
  const updated = await prisma.priceList.update({ where: { id }, data: { isActive: false } })
  await prisma.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'PRICE_LIST_DEACTIVATED', entity: 'PriceList', entityId: updated.id, metadata: { name: updated.name } } })
  return json({ id: updated.id, isActive: updated.isActive })
}
