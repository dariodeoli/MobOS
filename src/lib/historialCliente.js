// Historial del cliente (ficha): grupos de filtro, rango de período y resumen
// de compras. Es la misma lógica que `backend/lib/customer-history.ts`; la
// demo la usa en el navegador y la cuenta real la aplica el servidor.
export const GRUPOS_HISTORIAL = [
  { key: 'todo', label: 'Todo' },
  { key: 'compras', label: 'Compras' },
  { key: 'pagos', label: 'Pagos' },
  { key: 'saldo', label: 'Saldo y cuotas' },
  { key: 'cotizaciones', label: 'Cotizaciones' },
  { key: 'taller', label: 'Taller' },
  { key: 'garantias', label: 'Garantías' },
  { key: 'tradein', label: 'Trade-in' },
  { key: 'mensajes', label: 'Mensajes' },
  { key: 'notas', label: 'Notas' },
  { key: 'datos', label: 'Datos' },
]

export const PERIODOS_HISTORIAL = [
  { key: 'todo', label: 'Todo el tiempo' },
  { key: '30', label: 'Últimos 30 días' },
  { key: '90', label: 'Últimos 90 días' },
  { key: '365', label: 'Último año' },
]

const CLAVES = new Set(GRUPOS_HISTORIAL.map((grupo) => grupo.key))

/** Grupo de filtro de un evento de cronología (según su tipo y su texto). */
export function grupoEvento(evento = {}) {
  const texto = `${evento.label || ''} ${evento.action || ''}`.toLowerCase()
  const tipo = String(evento.type || '')
  if (tipo === 'credit' || /cuota|saldo a favor|mora|crédito|credito/.test(texto)) return 'saldo'
  if (tipo === 'quote' || /cotizaci/.test(texto)) return 'cotizaciones'
  if (tipo === 'tradein' || /trade-?in|parte de pago/.test(texto)) return 'tradein'
  if (tipo === 'service') return 'taller'
  if (tipo === 'warranty') return 'garantias'
  if (tipo === 'payment') return 'pagos'
  if (tipo === 'order') return 'compras'
  if (tipo === 'notice' || tipo === 'message' || /mensaje|whatsapp|correo|enviad|compartid/.test(texto)) return 'mensajes'
  if (tipo === 'note' || tipo === 'followUp') return 'notas'
  return 'datos'
}

/** Normaliza una lista de grupos ("compras,pagos") descartando los desconocidos. */
export function gruposValidos(valor) {
  const lista = Array.isArray(valor) ? valor : String(valor || '').split(',')
  return [...new Set(lista.map((item) => String(item).trim()).filter((item) => CLAVES.has(item) && item !== 'todo'))]
}

/** Desde cuándo (ms) corta un período relativo; null = sin corte. */
export function desdePeriodo(periodo, ahora = Date.now()) {
  const dias = Number(periodo)
  return Number.isFinite(dias) && dias > 0 ? ahora - dias * 86400000 : null
}

/** Filtra eventos por grupos y período (la cuenta real lo hace en el servidor). */
export function filtrarEventos(eventos, { grupos = [], periodo = 'todo', ahora = Date.now() } = {}) {
  const permitidos = gruposValidos(grupos)
  const desde = desdePeriodo(periodo, ahora)
  return (eventos || []).filter((evento) => {
    if (permitidos.length && !permitidos.includes(grupoEvento(evento))) return false
    if (desde != null && new Date(evento.createdAt).getTime() < desde) return false
    return true
  })
}

/** Gastado, ticket promedio, última compra y frecuencia de los pedidos no anulados. */
export function resumenCompras(pedidos) {
  const validos = (pedidos || []).filter((pedido) => pedido.status !== 'CANCELLED')
  const fechas = validos.map((pedido) => new Date(pedido.createdAt).getTime()).filter(Number.isFinite).sort((a, b) => a - b)
  const gastadoPyg = validos.reduce((suma, pedido) => suma + Number(pedido.totalPyg || 0), 0)
  const frecuenciaDias = fechas.length > 1 ? Math.round((fechas[fechas.length - 1] - fechas[0]) / 86400000 / (fechas.length - 1)) : null
  return {
    pedidos: validos.length,
    gastadoPyg,
    ticketPromedioPyg: validos.length ? Math.round(gastadoPyg / validos.length) : 0,
    ultimaCompra: fechas.length ? new Date(fechas[fechas.length - 1]).toISOString() : null,
    frecuenciaDias,
  }
}
