// Cotizaciones del cliente (#240 → portal): una sola verdad para el chip de la
// cuenta, el aviso de vencimiento y la página pública de la cotización. El
// borrador (DRAFT) es interno de la tienda y nunca se expone al cliente.

export const ABIERTAS = ['DRAFT', 'SENT']

export const ESTADO_COTIZACION = {
  DRAFT: 'Pendiente de confirmar',
  SENT: 'Pendiente de confirmar',
  ACCEPTED: 'Aceptada',
  REJECTED: 'Rechazada',
  CONVERTED: 'Convertida en pedido',
  EXPIRED: 'Vencida',
  CANCELLED: 'Cancelada',
}

// Clases del chip en la página pública (mismo set que usaba la página).
export const TONO_COTIZACION = {
  ACCEPTED: 'border-ok/30 bg-ok/10 text-ok',
  REJECTED: 'border-bad/30 bg-bad/10 text-bad',
  EXPIRED: 'border-bad/30 bg-bad/10 text-bad',
  CANCELLED: 'border-bad/30 bg-bad/10 text-bad',
  CONVERTED: 'border-fono/30 bg-fono/10 text-fono-light',
}

// Tono del chip compartido del portal (`PortalEstado`).
const TONO_PORTAL = { ACCEPTED: 'ok', REJECTED: 'bad', EXPIRED: 'bad', CANCELLED: 'bad', CONVERTED: 'info' }
export const tonoCotizacion = (estado) => TONO_PORTAL[estado] || 'warn'

const DIA = 86400000

// Días que faltan para el vencimiento (negativos si ya pasó); null sin fecha.
export function diasParaVencer(cotizacion, ahora = Date.now()) {
  const vence = Date.parse(cotizacion?.validUntil || '')
  return Number.isNaN(vence) ? null : Math.ceil((vence - ahora) / DIA)
}

// Estado visible: una cotización abierta con la validez cumplida se muestra
// Vencida aunque la base todavía diga SENT (el portal no escribe al leer).
export function estadoCotizacion(cotizacion, ahora = Date.now()) {
  const estado = String(cotizacion?.status || '')
  if (!ABIERTAS.includes(estado)) return estado
  const vence = Date.parse(cotizacion?.validUntil || '')
  return !Number.isNaN(vence) && vence <= ahora ? 'EXPIRED' : estado
}

// Enlace público para abrirla y aceptarla/rechazarla (misma ruta en la app y en
// el subdominio del portal). `demo` mantiene la demo funcional sin API.
export function cotizacionUrlFor(cotizacion, { demo = false } = {}) {
  const token = cotizacion?.publicToken
  if (!token) return ''
  return `/cotizacion/${encodeURIComponent(token)}${demo ? '?demo=1' : ''}`
}
