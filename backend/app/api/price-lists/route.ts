import { prisma } from '../../../lib/prisma'
import { canAccessAny, requireSession } from '../../../lib/auth'
import { error, json } from '../../../lib/http'
import { InputError, objectInput, textInput } from '../../../lib/payment-input'
import { parsePriceListItems, PriceListInputError } from '../../../lib/price-lists'
import { createPriceList, PriceListServiceError } from '../../../lib/price-list-service'

const priceListInclude = {
  items: { include: { tiers: { orderBy: { minQty: 'asc' as const } } } },
  _count: { select: { customers: true } },
}


// Los ítems por producto solo pueden apuntar a productos de la empresa.
async function productosDelTenant(tenantId: string, items: ReturnType<typeof parsePriceListItems>) {
  const ids = (items || []).filter(item => item.scope === 'PRODUCT').map(item => item.productId as string)
  if (!ids.length) return true
  const propios = await prisma.product.count({ where: { id: { in: [...new Set(ids)] }, tenantId } })
  return propios === new Set(ids).size
}

// El detalle (categorías y precios por lista) es información comercial: la
// pantalla que lo consume es de administración. Los vendedores resuelven su
// precio por /api/pricing, que devuelve el precio aplicable sin exponer la lista.
const PUEDE_VER_LISTAS = ['ADMIN', 'GERENTE']

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  // Sin permiso, el listado se ve vacío (el vendedor cobra con /api/pricing):
  // así la pantalla no rompe y no se exponen las listas de la empresa.
  if (!PUEDE_VER_LISTAS.includes(session.user.role)) return json([])
  return json(await prisma.priceList.findMany({
    where: { tenantId: session.user.tenantId },
    include: priceListInclude,
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
  }))
}

export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['products:manage'])) return error('Solo administración o gerencia gestionan listas de precios.', 403)
  try {
    const body = objectInput(await request.json())
    const created = await createPriceList(prisma, { id: session.user.id, tenantId: session.user.tenantId, role: session.user.role, permissions: session.user.permissions }, body)
    return json(created, { status: 201 })
  } catch (cause) {
    if (cause instanceof PriceListServiceError) return error(cause.message, cause.code === 'forbidden' ? 403 : cause.code === 'not_found' ? 404 : cause.code === 'conflict' ? 409 : 400)
    if (cause instanceof PriceListInputError || cause instanceof InputError) return error(cause.message, 400)
    return error('No se pudo crear la lista (¿ya existe una con ese nombre?).', 409)
  }
}
