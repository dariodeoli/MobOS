// Correo real desde la demo (pedido de Dario): la demo corre en el navegador sin
// backend, pero cuando se crea un pedido o una cotización con correo de cliente, o
// cambia el estado de un pedido, se pide UN correo al endpoint público
// `POST /api/public/demo-email`. Va sin sesión ni cookies (mismo criterio que el
// RUC de la demo) y solo con datos estructurados: tipo, número, ítems, descuento,
// total, nombre y correo. Cualquier otro dato queda en el navegador.

export const TIPOS_CORREO_DEMO = ['receipt', 'quote', 'ready_for_pickup', 'in_transit', 'delivered']

// Estado de entrega del pedido → tipo de correo de la demo. Los estados sin
// correo propio (p. ej. «listo para envío») siguen mostrando la vista previa.
const TIPO_POR_ENTREGA = {
  PENDING: 'receipt',
  PROCESSING: 'receipt',
  READY_FOR_PICKUP: 'ready_for_pickup',
  SHIPPED: 'in_transit',
  IN_TRANSIT: 'in_transit',
  PICKED_UP: 'delivered',
  DELIVERED: 'delivered',
}
export const tipoCorreoDemoDeEntrega = (estado) => TIPO_POR_ENTREGA[estado] || ''

/** Casillas ficticias de la demo (@ejemplo.com, @example.org, .test…) nunca reciben correo real. */
export const correoDemoEnviable = (email) => {
  const texto = String(email || '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto) && !/@(?:[^@]+\.)?(?:ejemplo|example)\.[a-z.]+$/.test(texto) && !/\.(?:test|invalid|local|localhost|ejemplo|example)$/.test(texto)
}

const entero = (valor) => Math.max(0, Math.round(Number(valor) || 0))
const sinNumeral = (texto) => String(texto || '').trim()

/** Ítems en el formato del endpoint; descarta filas vacías y limita la cantidad. */
export function itemsParaCorreoDemo(lineas = [], { envio = 0 } = {}) {
  const items = (Array.isArray(lineas) ? lineas : [])
    .map((linea) => ({
      quantity: Math.min(99, Math.max(1, entero(linea.quantity ?? linea.cantidad ?? 1))),
      description: sinNumeral(linea.description ?? linea.nombre ?? 'Artículo').slice(0, 70) || 'Artículo',
      unitPricePyg: entero(linea.unitPricePyg ?? linea.precio),
    }))
    .slice(0, envio > 0 ? 9 : 10)
  if (envio > 0) items.push({ quantity: 1, description: 'Envío', unitPricePyg: entero(envio) })
  return items
}

/** Resumen de una fila sin ítems detallados (repartos): un solo renglón con el total. */
export function itemsDeResumenCorreoDemo(articulos = [], total = 0) {
  const detalle = (Array.isArray(articulos) ? articulos : []).map((fila) => sinNumeral(fila).replace(/^\d+×\s*/, '')).filter(Boolean).join(', ')
  return [{ quantity: 1, description: detalle.slice(0, 70) || 'Pedido', unitPricePyg: entero(total) }]
}

/**
 * Datos del correo de un pedido (detalle del pedido): el total del correo siempre
 * coincide con el total del pedido; la diferencia con los ítems es descuento o envío.
 * Devuelve `null` si el estado de entrega no tiene correo propio.
 */
export function demoCorreoDePedido(order) {
  const kind = tipoCorreoDemoDeEntrega(order?.fulfillmentStatus)
  if (!kind || !order) return null
  const items = itemsParaCorreoDemo(order.items || [])
  const subtotal = items.reduce((suma, item) => suma + item.quantity * item.unitPricePyg, 0)
  const total = Number.isFinite(Number(order.totalPyg)) && order.totalPyg !== null && order.totalPyg !== undefined ? entero(order.totalPyg) : subtotal
  let descuento = Math.max(0, subtotal - total)
  if (total > subtotal) {
    items.splice(9)
    items.push({ quantity: 1, description: 'Envío y cargos', unitPricePyg: total - subtotal })
    descuento = 0
  }
  return { kind, numero: order.orderNumber || order.number || '', cliente: order.customer?.name || (typeof order.customer === 'string' ? order.customer : '') || order.customerName || '', items, descuento }
}

/** Arma el cuerpo del pedido; el total siempre se recalcula (el servidor lo vuelve a verificar). */
export function payloadCorreoDemo({ kind, numero, email, cliente = '', items = [], descuento = 0, validUntil = null }) {
  const subtotal = items.reduce((suma, item) => suma + item.quantity * item.unitPricePyg, 0)
  const rebaja = Math.min(subtotal, entero(descuento))
  return {
    kind,
    number: sinNumeral(numero),
    email: sinNumeral(email),
    customerName: sinNumeral(cliente).slice(0, 60),
    items,
    ...(rebaja > 0 ? { discountPyg: rebaja } : {}),
    totalPyg: subtotal - rebaja,
    ...(kind === 'quote' && validUntil ? { validUntil: String(validUntil).slice(0, 10) } : {}),
  }
}

const MOTIVO_GENERICO = 'No pudimos enviar el correo. Probá de nuevo en unos minutos.'

/**
 * Pide el envío. Devuelve:
 * - `{ estado: 'enviado', para }` cuando el relay aceptó el correo;
 * - `{ estado: 'desactivado' }` si el envío real está apagado o no disponible (la demo
 *   muestra la vista previa como siempre);
 * - `{ estado: 'rechazado', motivo, codigo }` con el motivo legible (cuota, formato, etc.).
 */
export async function enviarCorreoDemo(payload, { apiUrl, fetchImpl = fetch, signal, timeoutMs = 15000 } = {}) {
  if (!apiUrl || !correoDemoEnviable(payload?.email)) return { estado: 'desactivado', codigo: 'sin_destino_real' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  signal?.addEventListener('abort', () => controller.abort(), { once: true })
  try {
    const response = await fetchImpl(`${String(apiUrl).replace(/\/$/, '')}/api/public/demo-email`, {
      method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: controller.signal,
    })
    const cuerpo = await response.json().catch(() => ({}))
    if (response.ok && cuerpo?.sent === true) return { estado: 'enviado', para: payload.email }
    const codigo = cuerpo?.details?.code || cuerpo?.code || ''
    if (response.status === 503 && (codigo === 'demo_email_disabled' || codigo === 'demo_email_unavailable')) return { estado: 'desactivado', codigo }
    const espera = Number(response.headers.get('retry-after'))
    const sufijo = response.status === 429 && Number.isFinite(espera) && espera > 0 ? ` Podés reintentar en ${Math.max(1, Math.ceil(espera / 3600))} h.` : ''
    return { estado: 'rechazado', codigo, motivo: `${cuerpo?.message || MOTIVO_GENERICO}${response.status === 429 ? sufijo : ''}` }
  } catch {
    // Sin red o sin API configurada: la demo sigue funcionando con la vista previa.
    return { estado: 'desactivado', codigo: 'network' }
  } finally {
    clearTimeout(timer)
  }
}

/** Texto del aviso al usuario para un resultado de `enviarCorreoDemo`. */
export function avisoCorreoDemo(resultado, email) {
  if (resultado?.estado === 'enviado') return { tipo: 'success', titulo: `Te enviamos el correo a ${email}`, detalle: 'Revisá tu bandeja (y el correo no deseado).' }
  if (resultado?.estado === 'rechazado') return { tipo: 'error', titulo: 'No se envió el correo', detalle: resultado.motivo || MOTIVO_GENERICO }
  return null
}

