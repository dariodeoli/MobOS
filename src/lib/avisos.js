// «Avisar al cliente» en cada cambio de estado: qué plantilla corresponde a cada
// evento (pedido, reparto, orden de taller, cobranza, cotización) y cómo armar el
// correo. Nada se envía solo: el vendedor abre WhatsApp o su correo con el texto
// ya elegido y decide si lo manda.
import { PREFIJO_CORREO, canalDe, claveCorreo, renderPlantilla } from './whatsappPlantillas.js'

// Estado de entrega del pedido → plantilla del evento.
export const PLANTILLA_POR_ENTREGA = {
  PENDING: 'pedido_confirmado',
  PROCESSING: 'pedido_confirmado',
  READY_TO_SHIP: 'ready_to_ship',
  READY_FOR_PICKUP: 'ready_for_pickup',
  SHIPPED: 'en_camino',
  IN_TRANSIT: 'en_camino',
  PICKED_UP: 'entregado',
  DELIVERED: 'entregado',
}

// Estado de la orden de taller → plantilla del evento.
export const PLANTILLA_POR_TALLER = {
  RECIBIDO: 'equipo_recibido',
  DIAGNOSTICO: 'diagnostico_listo',
  CON_TECNICO: 'diagnostico_listo',
  ESPERANDO_REPUESTO: 'esperando_repuesto',
  REPARADO: 'reparado',
  LISTO: 'reparacion_lista',
}

// Cobranza: la cuota vencida y la que está por vencer tienen texto distinto.
export const plantillaDeCuota = (vencida) => (vencida ? 'cuota_vencida' : 'cuota_por_vencer')

// Cotización: se avisa al enviarla.
export const PLANTILLA_COTIZACION = 'cotizacion_enviada'

export const plantillaDeEntrega = (estado) => PLANTILLA_POR_ENTREGA[estado] || ''
export const plantillaDeTaller = (estado) => PLANTILLA_POR_TALLER[estado] || ''

/** Casilla de correo con forma válida (misma regla simple que el servidor). */
export const correoValido = (valor) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(valor || '').trim())

/**
 * Elige la versión correo de un evento: la de clave `email.<evento>`; si la
 * empresa la borró o desactivó, no hay correo para ese evento.
 */
export function plantillaCorreoDeEvento(lista, evento) {
  if (!evento) return null
  return (Array.isArray(lista) ? lista : []).find((item) => canalDe(item) === 'email' && item.isActive !== false && item.key === claveCorreo(evento)) || null
}

/** Arma el asunto y el cuerpo del correo con los datos del evento. */
export function armarCorreo(plantilla, valores = {}) {
  if (!plantilla) return null
  return {
    asunto: renderPlantilla(plantilla.subject || plantilla.name || '', valores).replace(/\s+/g, ' ').trim(),
    cuerpo: renderPlantilla(plantilla.body, valores).trim(),
  }
}

/** Enlace `mailto:` con asunto y cuerpo escapados. Sin casilla válida no hay enlace. */
export function mailtoUrl(para, { asunto = '', cuerpo = '' } = {}) {
  if (!correoValido(para)) return ''
  const partes = []
  if (asunto) partes.push(`subject=${encodeURIComponent(asunto)}`)
  if (cuerpo) partes.push(`body=${encodeURIComponent(cuerpo)}`)
  return `mailto:${encodeURIComponent(String(para).trim()).replace(/%40/g, '@')}${partes.length ? `?${partes.join('&')}` : ''}`
}

/** «12 meses» / «90 días» a partir de los días de garantía. */
export function textoGarantia(dias) {
  const n = Number(dias)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n % 30 === 0) { const meses = n / 30; return `${meses} ${meses === 1 ? 'mes' : 'meses'}` }
  return `${n} ${n === 1 ? 'día' : 'días'}`
}

/**
 * Variables de producto y garantía de un pedido para las plantillas: el primer
 * equipo con garantía (o el primer artículo) y hasta cuándo cubre.
 */
export function variablesDeProducto(items, desde) {
  const lista = Array.isArray(items) ? items : []
  const conGarantia = lista.find((item) => Number(item?.warrantyDays) > 0)
  const principal = conGarantia || lista[0]
  const dias = Number(conGarantia?.warrantyDays) || 0
  let hasta = ''
  if (dias && desde) {
    const fecha = new Date(desde)
    if (!Number.isNaN(fecha.getTime())) { fecha.setDate(fecha.getDate() + dias); hasta = fecha.toLocaleDateString('es-PY') }
  }
  return { producto: principal?.description || principal?.name || '', garantia: textoGarantia(dias), garantia_hasta: hasta }
}

export { PREFIJO_CORREO }
