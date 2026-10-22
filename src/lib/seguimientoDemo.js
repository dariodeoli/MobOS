// Seguimiento público de un pedido DEMO (QR, WhatsApp, correo, «Ver seguimiento»).
//
// El pedido demo vive solo en el navegador de quien lo creó: el backend no lo
// conoce, así que la página pública no puede pedirlo por token. En su lugar el
// enlace lleva un resumen mínimo en el fragmento (`#d=<base64url de JSON>`), que
// el navegador nunca envía a ningún servidor. La página pública lo detecta y
// muestra el seguimiento con la banda «Demo · datos ficticios», sin llamadas.
//
// El resumen no lleva datos personales: ni nombre, teléfono o correo del
// cliente, ni direcciones. Solo número, fecha, estado, cronología corta, ítems
// (nombre, cantidad, precio), total, pagado y nombre de la tienda demo.
// Es entrada de terceros: al leerlo se valida y se acota todo.
import { codigoPedido, totalesPedido } from '../utils/pedido.js'

export const MAX_FRAGMENTO_DEMO = 1500
export const esTokenDemo = (token) => String(token || '').startsWith('demo-')

const FLUJOS = {
  DELIVERY: ['PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED'],
  RETIRO: ['PROCESSING', 'READY_FOR_PICKUP', 'PICKED_UP'],
}
const ETIQUETAS = {
  PROCESSING: 'En preparación',
  READY_TO_SHIP: 'Listo para enviar',
  READY_FOR_PICKUP: 'Listo para retirar',
  IN_TRANSIT: 'En camino al cliente',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregado',
  PICKED_UP: 'Retirado',
}
const ENCABEZADOS = { DELIVERY: 'Seguimiento de envío', RETIRO: 'Seguimiento de retiro' }

// base64url sobre UTF-8 (btoa/atob existen en navegadores y en Node >= 16).
function aBase64Url(contenido) {
  const bytes = new TextEncoder().encode(contenido)
  let binario = ''
  bytes.forEach((byte) => { binario += String.fromCharCode(byte) })
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function deBase64Url(codigo) {
  const normal = String(codigo).replace(/-/g, '+').replace(/_/g, '/')
  const binario = atob(normal + '='.repeat((4 - (normal.length % 4)) % 4))
  return new TextDecoder().decode(Uint8Array.from(binario, (c) => c.charCodeAt(0)))
}

const texto = (valor, max) => String(valor ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const entero = (valor, max = 1e12) => {
  const n = Math.round(Number(valor))
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0
}
const iso = (valor) => {
  const fecha = new Date(valor)
  return Number.isNaN(fecha.getTime()) ? new Date().toISOString() : fecha.toISOString()
}

/** Resumen mínimo de un pedido demo (cualquiera de las formas que circulan). */
export function resumenSeguimientoDemo(order = {}) {
  const { total, pagado } = totalesPedido(order)
  const lineas = Array.isArray(order.items) ? order.items : []
  const entrega = String(order.deliveryType || order.entrega || '').toLowerCase().includes('retiro') ? 'R' : 'D'
  const cronologia = (Array.isArray(order.timeline) ? order.timeline : [])
    .filter((evento) => ['created', 'payment', 'fulfillment'].includes(evento?.type))
    .slice(0, 4)
    .map((evento) => [evento.type[0], iso(evento.at), evento.type === 'payment' ? entero(evento.amountPyg) : texto(evento.metadata?.current, 20)])
  return {
    v: 1,
    n: texto(codigoPedido(order.orderNumber || order.numero || order.codigo), 24),
    f: iso(order.createdAt || order.creadoEn || order.fecha),
    e: texto(order.fulfillmentStatus || 'PROCESSING', 24),
    d: entrega,
    t: entero(total),
    p: entero(pagado),
    s: texto(order.tenant?.name || order.empresaNombre || 'Tienda demo', 40),
    i: lineas.map((linea) => [
      texto(linea.description || linea.descripcion || linea.productoNombre || 'Producto', 40),
      Math.max(1, entero(linea.quantity ?? linea.cantidad ?? 1, 9999)),
      entero(linea.unitPricePyg ?? linea.precioUnitario ?? (Number(linea.totalPyg || 0) / Math.max(1, Number(linea.quantity || 1)))),
    ]),
    m: 0,
    c: cronologia,
  }
}

/** Valor de `d=...` con el resumen; si no entra en ~1500 bytes recorta ítems («+N más»). */
export function codificarSeguimientoDemo(order) {
  const resumen = resumenSeguimientoDemo(order)
  const todos = resumen.i
  let conservados = todos.length
  let codigo = aBase64Url(JSON.stringify(resumen))
  while (codigo.length > MAX_FRAGMENTO_DEMO && conservados > 0) {
    conservados -= 1
    resumen.i = todos.slice(0, conservados)
    resumen.m = todos.length - conservados
    codigo = aBase64Url(JSON.stringify(resumen))
  }
  if (codigo.length > MAX_FRAGMENTO_DEMO) { resumen.c = []; codigo = aBase64Url(JSON.stringify(resumen)) }
  return codigo
}

/** `<base>/pedidos/demo-<id>#d=...`: el token no es secreto ni existe en el backend. */
export function enlaceSeguimientoDemo(base, order, idToken = '') {
  const id = texto(idToken || order?.id || order?.orderNumber || 'pedido', 60)
  const ruta = `${base}/pedidos/${encodeURIComponent(esTokenDemo(id) ? id : `demo-${id}`)}`
  return `${ruta}#d=${codificarSeguimientoDemo(order)}`
}

/** Lee `#d=...` y arma el pedido con la forma que muestra PedidoPublico; `null` si no hay datos válidos. */
export function leerSeguimientoDemo(hash = '') {
  const crudo = String(hash || '').replace(/^#/, '')
  const parte = crudo.split('&').find((fragmento) => fragmento.startsWith('d='))
  if (!parte) return null
  let datos
  try { datos = JSON.parse(deBase64Url(parte.slice(2))) } catch { return null }
  if (!datos || typeof datos !== 'object' || datos.v !== 1) return null
  const metodo = datos.d === 'R' ? 'RETIRO' : 'DELIVERY'
  const flujo = FLUJOS[metodo]
  const creado = iso(datos.f)
  const estado = texto(datos.e, 24) === 'PENDING' ? 'PROCESSING' : texto(datos.e, 24) || 'PROCESSING'
  const indice = flujo.indexOf(estado)
  const base = new Date(creado).getTime()
  const total = entero(datos.t)
  const pagado = entero(datos.p)
  const items = (Array.isArray(datos.i) ? datos.i : []).slice(0, 30).map((fila) => {
    const [nombre, cantidad, unitario] = Array.isArray(fila) ? fila : []
    const qty = Math.max(1, entero(cantidad, 9999))
    return { description: texto(nombre, 40) || 'Producto', quantity: qty, unitPricePyg: entero(unitario), totalPyg: qty * entero(unitario) }
  })
  const ocultos = entero(datos.m, 9999)
  if (ocultos > 0) items.push({ description: `+${ocultos} más`, resumen: true })
  const timeline = (Array.isArray(datos.c) ? datos.c : []).slice(0, 4).map((fila) => {
    const [tipo, at, extra] = Array.isArray(fila) ? fila : []
    if (tipo === 'p') return { type: 'payment', at: iso(at), amountPyg: entero(extra) }
    if (tipo === 'f') return { type: 'fulfillment', at: iso(at), metadata: { current: texto(extra, 20) } }
    return { type: 'created', at: iso(at) }
  })
  return {
    demo: true,
    orderNumber: texto(datos.n, 24) || 'Pedido demo',
    status: total > 0 && pagado >= total ? 'COMPLETED' : 'PENDING',
    fulfillmentStatus: estado,
    createdAt: creado,
    updatedAt: creado,
    totalPyg: total,
    totalPagado: pagado,
    items,
    payments: [],
    level: 'detallado',
    timeline,
    company: { name: texto(datos.s, 40) || 'Tienda demo' },
    tracking: {
      metodo,
      encabezado: ENCABEZADOS[metodo],
      estado,
      estadoLabel: ETIQUETAS[estado] || estado,
      pasos: flujo.map((key, posicion) => ({
        key,
        label: ETIQUETAS[key],
        hecho: indice >= 0 && posicion <= indice,
        actual: key === estado,
        at: indice >= 0 && posicion <= indice ? new Date(base + posicion * 3600000).toISOString() : null,
      })),
    },
  }
}
