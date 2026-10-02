// Cotizaciones demo (#314): capa de estado de la pestaña sobre los fixtures
// canónicos de #324 (`src/lib/demo/cotizaciones.js`). Este módulo es PURO (sin
// API ni storage): la lista del vendedor, el buscador y el portal público lo
// leen; la conversión en pedido vive en `demoCotizacionConversion.js`.
//
// Coordinación PLT #324: los fixtures (una cotización por etapa, con Lucía y
// Carlos espejando la ficha) son la única fuente; acá solo se agregan los
// cambios de la pestaña (enviar, aceptar, cancelar, convertir, alta nueva) y la
// cronología local. Nada de esto se escribe en la base.
import { COTIZACIONES_DEMO, listDemoQuotes } from './demo/cotizaciones.js'
import { ABIERTAS, estadoCotizacion } from './cotizaciones.js'

const iso = (dias, hora = 10) => {
  const fecha = new Date(Date.now() + dias * 86400000)
  fecha.setHours(hora, 15, 0, 0)
  return fecha.toISOString()
}
const item = (description, quantity, unitPricePyg, extra = {}) => ({
  productId: null,
  description,
  quantity,
  unitPricePyg,
  totalPyg: quantity * unitPricePyg,
  ...extra,
})
const totales = (items, discountPyg = 0) => {
  const subtotal = items.reduce((suma, fila) => suma + Number(fila.totalPyg || 0), 0)
  return { subtotalPyg: subtotal, discountPyg, totalPyg: Math.max(0, subtotal - discountPyg) }
}

// Estado de la pestaña (mismo criterio que el resto de la demo): los seeds se
// muestran siempre y lo que se cambia acá vive en memoria hasta recargar.
const overrides = new Map()
const historial = new Map()
const numeroDe = (cotizacion) => Number(String(cotizacion?.number || '').match(/(\d+)$/)?.[1]) || 0
let secuencia = Math.max(0, ...COTIZACIONES_DEMO.map(numeroDe)) + 1

const eventosBase = (cotizacion) => ([
  {
    id: `${cotizacion.id}-creada`,
    type: 'quote',
    action: 'Cotización creada',
    createdAt: cotizacion.createdAt,
    user: { id: 'demo-user', name: cotizacion.seller?.name || cotizacion.sellerName || 'Equipo demo' },
    detail: `${cotizacion.number} · ${cotizacion.customerName || 'Sin cliente'} · ${cotizacion.items?.length || 0} ítem(s)`,
  },
  ...(historial.get(cotizacion.id) || []),
])

/** Cotización demo ya resuelta con el estado de la pestaña. */
function conOverrides(cotizacion) {
  return { ...cotizacion, ...(overrides.get(cotizacion.id) || {}) }
}

/** Listado completo (fixtures canónicos + creadas) con la vigencia resuelta. */
export function listDemoCotizaciones() {
  const base = listDemoQuotes()
  const ids = new Set(base.map((fila) => fila.id))
  const creadas = [...overrides.entries()].filter(([id]) => !ids.has(id)).map(([, fila]) => fila)
  return [...base, ...creadas]
    .map(conOverrides)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
}

export function buscarDemoCotizacion(id) {
  return listDemoCotizaciones().find((fila) => fila.id === id) || null
}

export function buscarDemoCotizacionPorToken(token) {
  const buscado = String(token || '').trim()
  if (!buscado) return null
  return listDemoCotizaciones().find((fila) => fila.publicToken === buscado) || null
}

/** Eventos de la cronología local de una cotización demo. */
export function historialDemoCotizacion(id) {
  const cotizacion = buscarDemoCotizacion(id)
  if (!cotizacion) return []
  const extra = []
  if (cotizacion.resolution?.at) {
    extra.push({
      id: `${id}-resolucion`,
      type: 'quote',
      action: cotizacion.resolution.status === 'REJECTED' ? 'Rechazada por el cliente' : 'Aceptada por el cliente',
      createdAt: cotizacion.resolution.at,
      user: { id: 'demo-cliente', name: cotizacion.customerName || 'Cliente' },
      detail: cotizacion.resolution.note || 'Respuesta desde el enlace público',
    })
  }
  if (cotizacion.order?.orderNumber) {
    extra.push({
      id: `${id}-pedido`,
      type: 'sale',
      action: 'Convertida en pedido',
      createdAt: cotizacion.updatedAt || cotizacion.createdAt,
      user: { id: 'demo-user', name: cotizacion.seller?.name || cotizacion.sellerName || 'Equipo demo' },
      detail: `Pedido ${cotizacion.order.orderNumber}`,
    })
  }
  return [...extra, ...eventosBase(cotizacion)].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

function registrarEvento(id, accion, detalle, tipo = 'quote') {
  const lista = historial.get(id) || []
  historial.set(id, [{
    id: `${id}-evento-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`,
    type: tipo,
    action: accion,
    createdAt: new Date().toISOString(),
    user: { id: 'demo-user', name: 'Equipo demo' },
    detail: detalle,
  }, ...lista])
}

/** Aplica un cambio de estado o campos a una cotización demo. */
export function actualizarDemoCotizacion(id, cambios = {}, evento = null) {
  const actual = buscarDemoCotizacion(id)
  if (!actual) return null
  overrides.set(id, { ...(overrides.get(id) || {}), ...cambios, updatedAt: new Date().toISOString() })
  if (evento) registrarEvento(id, evento.action, evento.detail, evento.type)
  return buscarDemoCotizacion(id)
}

/** Marca una cotización demo como convertida en el pedido indicado. */
export function marcarDemoCotizacionConvertida(id, orderNumber) {
  const actual = buscarDemoCotizacion(id)
  return actualizarDemoCotizacion(id, {
    status: 'CONVERTED',
    order: { orderNumber },
    ...(actual?.resolution ? {} : { resolution: { status: 'ACCEPTED', at: new Date().toISOString(), method: 'MANUAL', note: null } }),
  }, { action: 'Convertida en pedido', detail: `Pedido ${orderNumber}`, type: 'sale' })
}

/** Aprobación desde el portal público demo: deja la evidencia y el pedido. */
export function aprobarDemoCotizacion(token, evidencia = {}) {
  const cotizacion = buscarDemoCotizacionPorToken(token)
  if (!cotizacion || !ABIERTAS.includes(cotizacion.status)) return null
  return actualizarDemoCotizacion(cotizacion.id, {
    status: 'ACCEPTED',
    approval: { ...evidencia },
    resolution: { status: 'ACCEPTED', at: evidencia.at || new Date().toISOString(), method: evidencia.method || 'OTP_EMAIL', note: null },
  }, { action: 'Aprobada con código', detail: `Versión ${evidencia.version ?? 1} · ${evidencia.destination || 'contacto demo'}`, type: 'quote' })
}

/** Alta demo de una cotización (borrador) desde el modal. */
export function crearDemoCotizacion({ customerName, customerId = null, validUntil = null, notes = '', discountPyg = 0, items = [] } = {}) {
  const numero = `COT-#${String(secuencia).padStart(4, '0')}`
  const id = `demo-cot-nueva-${secuencia}`
  secuencia += 1
  const filas = items.map((fila) => item(String(fila.description || '').trim(), Number(fila.quantity) || 1, Number(fila.unitPricePyg) || 0, fila.productId ? { productId: fila.productId } : {}))
  const cotizacion = {
    id,
    number: numero,
    status: 'DRAFT',
    customerName: String(customerName || '').trim() || 'Consumidor final',
    customerId: customerId || null,
    sellerName: 'Equipo demo',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    validUntil: validUntil || iso(7),
    notes: String(notes || ''),
    items: filas,
    ...totales(filas, Number(discountPyg) || 0),
    publicToken: id,
  }
  overrides.set(id, cotizacion)
  return buscarDemoCotizacion(id)
}

/** Estado visible de una cotización demo (vencida sin escribir en la base). */
export const estadoDemoCotizacion = (cotizacion) => estadoCotizacion(cotizacion)
