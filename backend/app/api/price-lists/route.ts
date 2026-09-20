import { prisma } from '../../../lib/prisma'
import { requireSession } from '../../../lib/auth'
import { error, json } from '../../../lib/http'
import { InputError, objectInput, textInput } from '../../../lib/payment-input'
import { parsePriceListItems, PriceListInputError } from '../../../lib/price-lists'

const priceListInclude = {
  items: { include: { tiers: { orderBy: { minQty: 'asc' as const } } } },
  _count: { select: { customers: true } },
}

const ROLES_GESTION = ['ADMIN', 'GERENTE']

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
  if (!ROLES_GESTION.includes(session.user.role)) return error('Solo administración o gerencia gestionan listas de precios.', 403)
  try {
    const body = objectInput(await request.json())
    const name = textInput(body.name, 'Nombre', 120)
    const items = parsePriceListItems(body.items) ?? []
    if (!await productosDelTenant(session.user.tenantId, items)) throw new InputError('Alguno de los productos no pertenece a la empresa.')
    const created = await prisma.priceList.create({
      data: {
        tenantId: session.user.tenantId,
        name,
        items: { create: items.map(item => ({ ...item, tiers: { create: item.tiers } })) },
      },
      include: priceListInclude,
    })
    await prisma.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'PRICE_LIST_CREATED', entity: 'PriceList', entityId: created.id, metadata: { name: created.name, items: items.length } } })
    return json(created, { status: 201 })
  } catch (cause) {
    if (cause instanceof PriceListInputError || cause instanceof InputError) return error(cause.message, 400)
    return error('No se pudo crear la lista (¿ya existe una con ese nombre?).', 409)
  }
}
