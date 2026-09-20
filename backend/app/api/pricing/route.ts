import { prisma } from '../../../lib/prisma'
import { requireSession } from '../../../lib/auth'
import { error, json } from '../../../lib/http'
import { PricingError, resolveUnitPrice, type PriceListItemInput } from '../../../lib/pricing'

// Precio efectivo autoritativo de un producto para un cliente y una cantidad.
// La UI del POS lo consulta al agregar, al cambiar de cliente y al cambiar la
// cantidad: el servidor decide el escalón, el ítem de lista, el mayorista o el
// minorista, y la UI solo muestra el origen.
const priceListInclude = { items: { include: { tiers: { orderBy: { minQty: 'asc' as const } } } } }

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const tenantId = session.user.tenantId
  const params = new URL(request.url).searchParams
  const quantity = Number(params.get('quantity') ?? '1')
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2147483647) return error('Cantidad inválida.')

  const customerId = (params.get('customerId') || '').trim().slice(0, 128)
  let customer: { id: string; pricingTier: string } | null = null
  let lista: { id: string; name: string; currency: string; items: PriceListItemInput[] } | null = null
  if (customerId) {
    const found = await prisma.customer.findFirst({ where: { id: customerId, tenantId }, select: { id: true, pricingTier: true, priceListId: true } })
    if (!found) return error('Cliente no encontrado.', 404)
    customer = { id: found.id, pricingTier: found.pricingTier }
    if (found.priceListId) {
      const priceList = await prisma.priceList.findFirst({ where: { id: found.priceListId, tenantId, isActive: true }, include: priceListInclude })
      if (priceList) lista = { id: priceList.id, name: priceList.name, currency: priceList.currency, items: priceList.items }
    }
  }
  const priceList = lista ? { id: lista.id, name: lista.name, currency: lista.currency } : null

  const single = (params.get('productId') || '').trim()
  const ids = single
    ? [single]
    : (params.get('productIds') || '').split(',').map(id => id.trim()).filter(Boolean).slice(0, 100)
  if (!ids.length) return error('Indicá productId o productIds.')
  const uniqueIds = [...new Set(ids)]
  const products = await prisma.product.findMany({ where: { id: { in: uniqueIds }, tenantId, isActive: true } })
  const byId = new Map(products.map(product => [product.id, product]))

  try {
    const resolver = (product: (typeof products)[number]) => resolveUnitPrice({ product, quantity, customer, priceList: lista ? { currency: lista.currency, items: lista.items } : null })
    if (single) {
      const product = byId.get(single)
      if (!product) return error('Producto no encontrado.', 404)
      return json({ productId: product.id, quantity, customerId: customer?.id ?? null, priceList, ...resolver(product) })
    }
    const prices: Record<string, ReturnType<typeof resolver>> = {}
    for (const id of uniqueIds) {
      const product = byId.get(id)
      if (product) prices[id] = resolver(product)
    }
    return json({ quantity, customerId: customer?.id ?? null, priceList, prices })
  } catch (cause) {
    return error(cause instanceof PricingError ? cause.message : 'No se pudo resolver el precio.', 400)
  }
}
