import { api } from '@/lib/api'
import { isDemoRuntime } from '@/lib/demoMode'
import { addProducto, updateProducto, getProductos, contextoActual, modoDatosActual } from '@/lib/storage'
import { leerDemo, guardarDemo } from './demoStorage.js'

export const TRADE_IN_STATUSES = {
  RECEIVED: 'Recibido', REVIEW: 'En revisión', REPAIR: 'En reparación',
  READY: 'Listo', STOCK: 'En stock', SOLD_EXTERNAL: 'Vendido por fuera',
}
export const TRADE_IN_DESTINATIONS = { NORMAL: 'Normal', OFFER: 'Oferta', WHOLESALE: 'Mayorista' }
export const TRADE_IN_TRANSITIONS = {
  RECEIVED: ['REVIEW'], REVIEW: ['REPAIR', 'READY', 'SOLD_EXTERNAL'],
  REPAIR: ['READY'], READY: ['REPAIR', 'STOCK', 'SOLD_EXTERNAL'],
  STOCK: [], SOLD_EXTERNAL: [],
}
const KEY = 'mobos:demo-trade-ins:v1'
export const tradeInValuePyg = (item) => Number(item.valuePyg ?? item.acceptedValuePyg)
export function normalizeTradeInHistory(entry) {
  const metadata = entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {}
  return {
    ...entry,
    at: entry.at || entry.createdAt,
    fromStatus: entry.fromStatus ?? metadata.from,
    toStatus: entry.toStatus ?? entry.status ?? metadata.to,
    notes: entry.notes ?? metadata.notes,
    repairCostPyg: entry.repairCostPyg ?? metadata.afterPyg,
    incrementPyg: entry.incrementPyg ?? metadata.incrementPyg,
    destination: entry.destination ?? metadata.destination,
    pricePyg: entry.pricePyg ?? metadata.pricePyg,
    actorName: entry.user?.name,
  }
}
const serialKey = (serial) => String(serial || '').trim().toUpperCase().replace(/[\s-]+/g, '')
const money = (value, name, positive = false) => {
  const n = typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN
  if (!Number.isSafeInteger(n) || n < (positive ? 1 : 0)) throw new Error(`${name}: ingresá guaraníes enteros ${positive ? 'mayores a cero' : 'sin negativos'}.`)
  return n
}

function assertDemo() {
  if (!isDemoRuntime || contextoActual().empresaId !== 'mobos-demo' || modoDatosActual() === 'api') {
    throw new Error('Este registro local sólo está disponible en la tienda demo.')
  }
}

export function loadDemoTradeIns() {
  assertDemo()
  const raw = leerDemo(KEY)
  if (!raw) return []
  let rows
  try { rows = JSON.parse(raw) } catch { throw new Error('El registro demo está dañado; no se sobrescribió.') }
  if (!Array.isArray(rows) || rows.some((row) => !row?.id || !serialKey(row.serial) || !TRADE_IN_TRANSITIONS[row.status])) {
    throw new Error('El registro demo tiene un formato inválido; no se sobrescribió.')
  }
  return rows
}

function write(rows) {
  guardarDemo(KEY, JSON.stringify(rows))
  window.dispatchEvent(new Event('mobos:trade-ins-updated'))
}

// Integration: validate BEFORE committing a demo sale; record AFTER it succeeds.
// Payment: { id?, method: 'TRADE_IN', amountPyg, tradeIn: { serial, model,
// conditionNotes, acceptedValuePyg? } }. Legacy medioPago: 'EQUIPO', monto supported.
// Pass the original payments once per order, never the amounts allocated per line.
function devices(payments) {
  if (!Array.isArray(payments)) throw new Error('Los pagos deben ser una lista.')
  return payments.flatMap((payment, index) => {
    const method = payment?.method || payment?.medioPago
    if (!['TRADE_IN', 'EQUIPO', 'TRADE-IN'].includes(method)) return []
    const device = payment.tradeIn || payment
    const serial = String(device.serial || '').trim().toUpperCase()
    const model = String(device.model || '').trim()
    const conditionNotes = String(device.conditionNotes || '').trim()
    if (!serialKey(serial) || !model || !conditionNotes) throw new Error('Cada equipo necesita serial, modelo y notas de condición.')
    const amount = money(payment.amountPyg ?? payment.monto ?? device.acceptedValuePyg, 'Valor de toma', true)
    const acceptedValuePyg = money(device.acceptedValuePyg ?? amount, 'Valor de toma', true)
    if (amount !== acceptedValuePyg) throw new Error('El valor de toma debe coincidir con el monto del pago.')
    return [{ serial, model, conditionNotes, acceptedValuePyg, valuePyg: acceptedValuePyg, paymentId: payment.id || null, paymentIndex: index }]
  })
}

export function validateDemoTradeIns(payments) {
  assertDemo()
  const parsed = devices(payments)
  const seen = new Set(loadDemoTradeIns().map((row) => serialKey(row.serial)))
  for (const product of getProductos()) {
    for (const serial of [product.serial, product.imei, product.atributos?.serial]) {
      if (serial) seen.add(serialKey(serial))
    }
  }
  for (const device of parsed) {
    const key = serialKey(device.serial)
    if (seen.has(key)) throw new Error(`Serial duplicado: ${device.serial}. No se registró ningún equipo.`)
    seen.add(key)
  }
  return true
}

export function recordDemoTradeIns(order, payments) {
  assertDemo()
  if (!order?.id || (order.tenantId && order.tenantId !== 'mobos-demo')) throw new Error('Se requiere una venta demo confirmada con id.')
  validateDemoTradeIns(payments)
  const rows = loadDemoTradeIns()
  const at = new Date().toISOString()
  const next = devices(payments).map(({ paymentIndex, ...device }) => ({
    ...device, id: `demo-trade-in-${crypto.randomUUID()}`, tenantId: 'mobos-demo',
    paymentId: device.paymentId || `${order.id}:trade-in:${paymentIndex}`,
    orderId: order.id, orderNumber: order.orderNumber || order.codigo || order.id,
    // Only snapshots supplied by the demo checkout; never query real customers.
    customerId: order.customerId || order.customer?.id || null,
    customerName: order.customerName || order.customer?.name || order.cliente || 'Cliente demo',
    sellerId: order.sellerId || order.vendedorId || order.seller?.id || 'demo-user',
    sellerName: order.sellerName || order.seller?.name || order.vendedorNombre || 'Vendedor demo',
    repairCostPyg: 0, status: 'RECEIVED', productId: null, createdAt: at, updatedAt: at,
    history: [{ at, fromStatus: null, toStatus: 'RECEIVED', notes: 'Recibido como parte de pago demo.', repairCostPyg: 0 }],
  }))
  const paymentKeys = new Set(rows.map((row) => `${row.orderId}:${row.paymentId}`))
  for (const row of next) {
    const key = `${row.orderId}:${row.paymentId}`
    if (paymentKeys.has(key)) throw new Error('Este pago ya tiene un equipo registrado.')
    paymentKeys.add(key)
  }
  if (next.length) write([...next, ...rows])
  return next
}

export function validateTradeInPatch(item, patch) {
  if (!item || patch.id !== item.id) throw new Error('Equipo no encontrado.')
  if (item.publicationState || !TRADE_IN_TRANSITIONS[item.status]?.includes(patch.status)) {
    throw new Error('Transición inválida o ya procesada. Actualizá la lista antes de continuar.')
  }
  const payload = { id: item.id, status: patch.status }
  if (patch.notes !== undefined && String(patch.notes).trim()) payload.notes = String(patch.notes).trim()
  if (patch.status === 'SOLD_EXTERNAL' && !payload.notes) throw new Error('Indicá comprador y destino en las notas de la venta externa.')
  // Matches backend: a positive increment, only while entering/leaving repair.
  if (patch.repairCostPyg !== undefined && patch.repairCostPyg !== '' && Number(patch.repairCostPyg) !== 0) {
    payload.repairCostPyg = money(patch.repairCostPyg, 'Nuevo costo de reparación', true)
    if (item.status !== 'REPAIR' && patch.status !== 'REPAIR') throw new Error('Los costos se registran durante reparación.')
  }
  money(tradeInValuePyg(item) + Number(item.repairCostPyg || 0) + (payload.repairCostPyg || 0), 'Total invertido')
  if (patch.status === 'STOCK') {
    if (item.productId) throw new Error('Este equipo ya tiene un producto asociado.')
    payload.pricePyg = money(patch.pricePyg, 'Precio de venta', true)
    if (!Object.hasOwn(TRADE_IN_DESTINATIONS, patch.destination)) throw new Error('Elegí un destino válido.')
    payload.destination = patch.destination
  } else if (patch.pricePyg !== undefined || patch.destination !== undefined) {
    throw new Error('Precio y destino sólo se admiten al publicar en stock.')
  }
  return payload
}

function advance(item, patch) {
  const at = new Date().toISOString()
  const repairCostPyg = Number(item.repairCostPyg || 0) + (patch.repairCostPyg || 0)
  return {
    ...item, ...patch, repairCostPyg, updatedAt: at,
    history: [...(item.history || []), { at, fromStatus: item.status, toStatus: patch.status,
      notes: patch.notes || '', repairCostPyg, incrementPyg: patch.repairCostPyg || 0,
      ...(patch.destination ? { destination: patch.destination, pricePyg: patch.pricePyg } : {}) }],
  }
}

export function updateDemoTradeIn(patch) {
  assertDemo()
  if (patch.status === 'STOCK') return publishDemoStock(patch.id, patch)
  const rows = loadDemoTradeIns()
  const item = rows.find((row) => row.id === patch.id)
  const updated = advance(item, validateTradeInPatch(item, patch))
  write(rows.map((row) => row.id === item.id ? updated : row))
  return updated
}

export function publishDemoStock(id, options) {
  assertDemo()
  const rows = loadDemoTradeIns()
  const item = rows.find((row) => row.id === id)
  const patch = validateTradeInPatch(item, { ...options, id, status: 'STOCK' })
  if (rows.some((row) => row.id !== id && serialKey(row.serial) === serialKey(item.serial)) ||
      getProductos().some((product) => product.tradeInId === id ||
        [product.serial, product.imei, product.atributos?.serial].some((serial) => serialKey(serial) === serialKey(item.serial)))) {
    throw new Error('El serial ya está registrado. No se duplicó el stock.')
  }
  // Persist the attempt BEFORE touching stock. An interrupted/failed attempt is
  // blocked across reloads: it needs reconciliation, never a blind retry.
  write(rows.map((row) => row.id === id ? { ...row, publicationState: 'STARTED' } : row))
  try {
    const product = addProducto(`${item.model} · ${item.serial}`, 'Celulares')
    if (!product?.id) throw new Error('No se pudo crear el producto demo.')
    updateProducto(product.id, {
      serial: item.serial, imei: item.serial, tradeInId: id, estado: 'Seminuevo',
      atributos: { serial: item.serial, modelo: item.model, estado: 'Seminuevo' },
      precioCosto: tradeInValuePyg(item) + Number(item.repairCostPyg || 0) + (patch.repairCostPyg || 0),
      precioVenta: patch.pricePyg, destination: patch.destination, stock: 1,
      ...(patch.destination === 'WHOLESALE' ? { precioMayorista: patch.pricePyg } : {}),
    })
    const updated = { ...advance(item, patch), productId: product.id }
    write(rows.map((row) => row.id === id ? updated : row))
    window.dispatchEvent(new Event('mobos:catalog-updated'))
    return updated
  } catch (error) {
    throw new Error(`Publicación demo incompleta; reintento bloqueado para evitar duplicados. Revisá inventario y registro local. ${error.message}`)
  }
}

// Admin API contract: GET -> TradeIn[], PATCH -> updated TradeIn.
// No fallback to demo on API errors and no customer creation from this module.
export const tradeInsApi = {
  list: () => api.get('/api/trade-ins'),
  update: (item, patch) => api.patch('/api/trade-ins', validateTradeInPatch(item, patch)),
}
