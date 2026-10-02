// Listas de precios del modo demo (#324): antes la pantalla mostraba «se
// configuran con una cuenta real». Ahora vive en memoria de la pestaña (misma
// semántica que el resto de la demo) con dos listas activas y una inactiva, y
// el POS resuelve contra ellas.
import { guardarDemo, leerDemo } from '../demoStorage.js'

const KEY = 'mobos:demo-pricelists:v1'

const item = (id, { scope = 'PRODUCT', productId = null, category = null, discountPct = null, tiers = [] }) => ({
  id,
  priceListId: null,
  scope,
  productId,
  category,
  unitPricePyg: null,
  unitPriceUsd: null,
  discountPct,
  tiers: tiers.map((tier, indice) => ({ id: `${id}-tier-${indice + 1}`, minQty: tier.minQty, unitPricePyg: tier.unitPricePyg })),
})

const seed = () => ([
  {
    id: 'demo-lista-minorista', name: 'Lista minorista', currency: 'PYG', isActive: true,
    createdAt: new Date(Date.now() - 90 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    items: [
      item('demo-item-min-1', { scope: 'CATEGORY', category: 'Accesorios', discountPct: 10 }),
      item('demo-item-min-2', { productId: 'demo-funda-magsafe-transparente', discountPct: 15 }),
    ],
    _count: { customers: 2 },
  },
  {
    id: 'demo-lista-mayorista', name: 'Mayorista', currency: 'PYG', isActive: true,
    createdAt: new Date(Date.now() - 120 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 15 * 86400000).toISOString(),
    items: [
      item('demo-item-may-1', { productId: 'demo-iphone-15-pro-max-256-titanio', discountPct: 7, tiers: [{ minQty: 3, unitPricePyg: 6650000 }, { minQty: 5, unitPricePyg: 6500000 }] }),
      item('demo-item-may-2', { productId: 'demo-iphone-15-pro-256-titanio', discountPct: 5, tiers: [{ minQty: 3, unitPricePyg: 6400000 }] }),
    ],
    _count: { customers: 1 },
  },
  {
    id: 'demo-lista-empresas', name: 'Empresas', currency: 'PYG', isActive: false,
    createdAt: new Date(Date.now() - 60 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 60 * 86400000).toISOString(),
    items: [item('demo-item-emp-1', { scope: 'CATEGORY', category: 'Celulares', discountPct: 5 })],
    _count: { customers: 0 },
  },
])

function read() {
  try {
    const guardado = JSON.parse(leerDemo(KEY))
    return Array.isArray(guardado) && guardado.length ? guardado : seed()
  } catch { return seed() }
}
const write = (listas) => { guardarDemo(KEY, JSON.stringify(listas)); return listas }

export function listDemoPriceLists() {
  return read().map((lista) => ({ ...lista, items: (lista.items || []).map((row) => ({ ...row, tiers: (row.tiers || []).map((tier) => ({ ...tier })) })) }))
}

export function createDemoPriceList(data = {}) {
  const listas = read()
  const id = `demo-lista-${Date.now().toString(36)}`
  const nueva = {
    id,
    name: String(data.name || 'Lista demo').slice(0, 120),
    currency: data.currency === 'USD' ? 'USD' : 'PYG',
    isActive: data.isActive !== false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items: (data.items || []).map((row, indice) => ({ ...item(`${id}-item-${indice + 1}`, row), priceListId: id })),
    _count: { customers: 0 },
  }
  write([...listas, nueva])
  return nueva
}

export function updateDemoPriceList(idOrData = {}, maybeData = {}) {
  const payload = typeof idOrData === 'object' ? idOrData : { ...maybeData, id: idOrData }
  const listas = read()
  const actual = listas.find((lista) => lista.id === payload.id)
  if (!actual) throw new Error('Lista de precios no encontrada.')
  const actualizada = {
    ...actual,
    ...(payload.name !== undefined ? { name: String(payload.name).slice(0, 120) } : {}),
    ...(payload.isActive !== undefined ? { isActive: Boolean(payload.isActive) } : {}),
    ...(payload.items !== undefined ? { items: payload.items.map((row, indice) => ({ ...item(`${actual.id}-item-${indice + 1}`, row), priceListId: actual.id })) } : {}),
    updatedAt: new Date().toISOString(),
  }
  write(listas.map((lista) => (lista.id === actual.id ? actualizada : lista)))
  return actualizada
}

export function deactivateDemoPriceList(id) {
  return updateDemoPriceList(id, { isActive: false })
}

/** Resolución de precio demo con la prioridad del backend: escalón > lista. */
export function pricingDemo({ productId = '', quantity = '1', customerId = '' } = {}, productos = []) {
  const cantidad = Math.max(1, Number(quantity) || 1)
  const producto = productos.find((row) => row.id === productId) || null
  const base = Number(producto?.precioVenta || producto?.precioMinoristaPyg || 0)
  for (const lista of read().filter((row) => row.isActive)) {
    for (const fila of lista.items || []) {
      const aplica = fila.scope === 'CATEGORY'
        ? fila.category && fila.category === (producto?.categoria || producto?.category)
        : fila.productId === productId
      if (!aplica) continue
      const tier = [...(fila.tiers || [])].filter((escalon) => cantidad >= Number(escalon.minQty)).sort((a, b) => Number(b.minQty) - Number(a.minQty))[0]
      if (tier) return { productId, quantity: cantidad, customerId: customerId || null, priceList: { id: lista.id, name: lista.name }, unitPricePyg: Number(tier.unitPricePyg), origin: 'TIER', currency: 'PYG', minQty: Number(tier.minQty), tiers: fila.tiers || [], unitPricePygFallback: Number(fila.unitPricePyg ?? base) }
      const descuento = Number(fila.discountPct || 0)
      const unitario = descuento > 0 ? Math.round(base * (1 - descuento / 100)) : base
      return { productId, quantity: cantidad, customerId: customerId || null, priceList: { id: lista.id, name: lista.name }, unitPricePyg: unitario, origin: 'LIST', currency: 'PYG', minQty: null, tiers: [], unitPricePygFallback: unitario }
    }
  }
  return { productId, quantity: cantidad, customerId: customerId || null, priceList: null, unitPricePyg: base, origin: 'RETAIL', currency: 'PYG', minQty: null, tiers: [], unitPricePygFallback: base }
}
