import { prisma } from '../../../../lib/prisma'
import { requireSession } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { InputError, objectInput } from '../../../../lib/payment-input'
import { PricingError } from '../../../../lib/pricing'
import { PriceListInputError } from '../../../../lib/price-lists'
import { updatePriceList, deactivatePriceList, PriceListServiceError, readPriceList } from '../../../../lib/price-list-service'

type RouteContext = { params: Promise<{ id: string }> }

const ROLES_GESTION = ['ADMIN', 'GERENTE']

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
    const updated = await prisma.$transaction(tx => updatePriceList(tx, { id: session.user.id, tenantId: session.user.tenantId, role: session.user.role, permissions: session.user.permissions }, id, body))
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
  if (!id) return error('Lista no encontrada.', 404)
  try {
    const updated = await prisma.$transaction(tx => deactivatePriceList(tx, { id: session.user.id, tenantId: session.user.tenantId, role: session.user.role, permissions: session.user.permissions }, id))
    return json({ id: updated.id, isActive: updated.isActive })
  } catch (cause) {
    if (cause instanceof PriceListServiceError) return error(cause.message, cause.code === 'forbidden' ? 403 : cause.code === 'not_found' ? 404 : cause.code === 'conflict' ? 409 : 400)
    return error('No se pudo desactivar la lista.', 409)
  }
}
