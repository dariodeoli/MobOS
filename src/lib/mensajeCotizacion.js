// Mensaje de la cotización para WhatsApp (#261): número, cliente, productos,
// total, equipo que entrega el cliente con su faltante, validez, tienda y el
// enlace público. Sale de la plantilla editable `cotizacion_enviada` (Mensajes);
// sin plantilla usa la de fábrica. Nunca lleva datos internos (costos, margen,
// vendedor interno). Puro y testeable; la pantalla decide cómo enviarlo.
import { gs } from '../utils/calculos.js'
import { renderPlantilla } from './whatsappPlantillas.js'

export const AVISO_VALOR_ESTIMADO = 'Valor estimado sujeto a revisión: se confirma al traer el equipo a la tienda (batería, estado, fallas).'

const ETIQUETA_CONDICION = { NEW: 'Nuevo', USED: 'Seminuevo', REFURBISHED: 'Reacondicionado' }

/** Plantilla de fábrica (la misma que el servidor siembra en Mensajes › Cotización enviada). */
export const PLANTILLA_COTIZACION_FABRICA = [
  '🧾 *Cotización {{cotizacion}}*',
  'Hola {{cliente}}, te comparto tu cotización de {{empresa}}.',
  '',
  '{{detalle}}',
  '',
  '💰 *Total: {{total}}*',
  '{{equipo_entrega}}',
  '{{faltante}}',
  '{{validez}}',
  '{{contacto}}',
  '',
  '{{aviso_revision}}',
  '🔗 Ver y aprobar: {{enlace}}',
].join('\n')

const texto = (valor) => String(valor ?? '').trim()
const numero = (valor) => { const n = Number(valor); return Number.isFinite(n) ? n : 0 }

const fechaCorta = (valor) => {
  if (!valor) return ''
  const fecha = new Date(valor)
  return Number.isNaN(fecha.getTime()) ? '' : fecha.toLocaleDateString('es-PY')
}

/** Lo que falta pagar: total menos el valor estimado del equipo que entrega el cliente (nunca negativo). */
export function faltanteCotizacion(totalPyg, tradeIn) {
  return Math.max(0, numero(totalPyg) - numero(tradeIn?.estimatedValuePyg))
}

/** «iPhone 15 Pro Max 256GB (Seminuevo)». */
export const nombreEquipoEntrega = (tradeIn) => {
  if (!tradeIn?.model) return ''
  const condicion = ETIQUETA_CONDICION[tradeIn.condition]
  return `${[tradeIn.model, tradeIn.storage].filter(Boolean).join(' ')}${condicion ? ` (${condicion})` : ''}`
}

/**
 * Variables de la plantilla `cotizacion_enviada` para una cotización. Los bloques
 * opcionales (equipo, faltante, validez, contacto) vienen vacíos si no aplican.
 */
export function variablesCotizacion(quote = {}, { enlace = '', maxItems = 8, tienda = {} } = {}) {
  const items = Array.isArray(quote.items) ? quote.items : []
  const lineas = items.slice(0, Math.max(1, maxItems)).map((item) => {
    const cantidad = numero(item.quantity) || 1
    const descripcion = texto(item.description || item.nombre) || 'Producto'
    const total = numero(item.totalPyg ?? cantidad * numero(item.unitPricePyg))
    return `• ${cantidad} × ${descripcion} — ${gs(total)}`
  })
  const restantes = items.length - lineas.length
  const detalle = ['📱 *Detalle*', ...lineas, restantes > 0 ? `• y ${restantes} ítem(s) más` : '', numero(quote.discountPyg) ? `• Descuento: −${gs(quote.discountPyg)}` : ''].filter(Boolean).join('\n')
  const tradeIn = quote.tradeIn?.model ? quote.tradeIn : null
  const valorEstimado = numero(tradeIn?.estimatedValuePyg)
  const faltante = faltanteCotizacion(quote.totalPyg, tradeIn)
  const contacto = [texto(tienda.nombre || quote.tenant?.name || quote.companyName), texto(tienda.direccion), texto(tienda.telefono) ? `Tel. ${texto(tienda.telefono)}` : ''].filter(Boolean)
  return {
    cotizacion: texto(quote.number) || 'tu cotización',
    cliente: texto(quote.customerName || quote.customer?.name) || 'cliente',
    nombre: texto(quote.customerName || quote.customer?.name) || 'cliente',
    empresa: texto(tienda.nombre || quote.tenant?.name || quote.companyName) || 'nuestra tienda',
    detalle,
    total: gs(numero(quote.totalPyg)),
    equipo_entrega: tradeIn ? `🔄 *Equipo que entregás*\n• ${nombreEquipoEntrega(tradeIn)}\n• Valor estimado: ${gs(valorEstimado)}` : '',
    faltante: tradeIn ? `✅ *Faltante a pagar: ${gs(faltante)}*` : '',
    vigencia: fechaCorta(quote.validUntil),
    validez: quote.validUntil ? `📅 Válida hasta el ${fechaCorta(quote.validUntil)}` : '',
    contacto: contacto.length ? `📍 ${contacto.join(' · ')}` : '',
    aviso_revision: tradeIn ? `_${AVISO_VALOR_ESTIMADO}_` : '',
    enlace: texto(enlace),
    vendedor: texto(quote.seller?.name),
  }
}

// Quita las líneas de «etiqueta: » sin valor y deja a lo sumo una línea en blanco seguida.
function limpiar(cuerpo) {
  const lineas = cuerpo.split('\n').map((linea) => linea.replace(/[ \t]+$/g, '')).filter((linea) => !/:$/.test(linea))
  const salida = []
  for (const linea of lineas) {
    if (linea === '' && (salida.length === 0 || salida[salida.length - 1] === '')) continue
    salida.push(linea)
  }
  while (salida.length && salida[salida.length - 1] === '') salida.pop()
  return salida.join('\n')
}

/**
 * @param {object} quote cotización (`GET /api/quotes`).
 * @param {object} [opciones]
 * @param {string} [opciones.enlace] URL pública de aceptación.
 * @param {string} [opciones.plantilla] cuerpo de la plantilla `cotizacion_enviada` de la empresa.
 * @param {{nombre?:string,direccion?:string,telefono?:string}} [opciones.tienda] datos de contacto de la tienda.
 * @param {number} [opciones.maxItems] ítems a listar (8 por defecto).
 */
export function mensajeCotizacion(quote = {}, { enlace = '', plantilla = '', tienda = {}, maxItems = 8 } = {}) {
  const variables = variablesCotizacion(quote, { enlace, tienda, maxItems })
  let cuerpo = texto(plantilla) || PLANTILLA_COTIZACION_FABRICA
  // Una plantilla editada a mano sin los bloques del equipo no puede perder el aviso ni el faltante.
  if (variables.equipo_entrega && !/\{\{\s*equipo_entrega\s*\}\}/.test(cuerpo)) cuerpo += '\n\n{{equipo_entrega}}\n{{faltante}}'
  if (variables.aviso_revision && !/\{\{\s*aviso_revision\s*\}\}/.test(cuerpo)) cuerpo += '\n\n{{aviso_revision}}'
  return limpiar(renderPlantilla(cuerpo, variables))
}
