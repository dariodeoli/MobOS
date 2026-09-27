// Mensaje profesional de la cotización para WhatsApp/correo (#261): número,
// cliente, resumen de ítems, total, validez y el enlace público. Puro y
// testeable; la pantalla decide cómo enviarlo (share sheet con el PDF adjunto o
// texto + wa.me como respaldo).
import { gs } from '../utils/calculos.js'

const texto = (valor) => String(valor ?? '').trim()

const fechaCorta = (valor) => {
  if (!valor) return ''
  const fecha = new Date(valor)
  return Number.isNaN(fecha.getTime()) ? '' : fecha.toLocaleDateString('es-PY')
}

/**
 * @param {object} quote cotización (`GET /api/quotes`).
 * @param {object} [opciones]
 * @param {string} [opciones.enlace] URL pública de aceptación.
 * @param {number} [opciones.maxItems] ítems a listar (8 por defecto).
 */
export function mensajeCotizacion(quote = {}, { enlace = '', maxItems = 8 } = {}) {
  const items = Array.isArray(quote.items) ? quote.items : []
  const empresa = texto(quote.tenant?.name || quote.companyName)
  const cliente = texto(quote.customerName || quote.customer?.name)
  const numero = texto(quote.number) || 'tu cotización'
  const vendedor = texto(quote.seller?.name)
  const lineas = items.slice(0, Math.max(1, maxItems)).map((item) => {
    const cantidad = Number(item.quantity || 1)
    const descripcion = texto(item.description || item.nombre) || 'Producto'
    const total = Number(item.totalPyg ?? cantidad * Number(item.unitPricePyg || 0))
    return `• ${cantidad} × ${descripcion} — ${gs(total)}`
  })
  const restantes = items.length - lineas.length
  const filas = [
    `Hola${cliente ? ` ${cliente}` : ''}, te comparto la cotización ${numero}${empresa ? ` de ${empresa}` : ''}.`,
    '',
    ...lineas,
    restantes > 0 ? `• y ${restantes} ítem(s) más` : '',
    '',
    `Total: ${gs(quote.totalPyg)}`,
    Number(quote.discountPyg || 0) ? `Incluye un descuento de ${gs(quote.discountPyg)}.` : '',
    quote.validUntil ? `Válida hasta el ${fechaCorta(quote.validUntil)}.` : '',
    vendedor ? `Te atiende ${vendedor}.` : '',
    enlace ? `\nRevisala y aceptala en línea: ${enlace}` : '',
  ]
  return filas.filter((fila) => fila !== '').join('\n').replace(/\n\n\n+/g, '\n\n').trim()
}
