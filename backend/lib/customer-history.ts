// Historial del cliente: grupos de filtro, período y resumen de compras.
// Espejo de `src/lib/historialCliente.js` (la demo lo aplica en el navegador).

export const GRUPOS = ['compras', 'pagos', 'saldo', 'cotizaciones', 'taller', 'garantias', 'tradein', 'mensajes', 'notas', 'datos'] as const
export type GrupoHistorial = (typeof GRUPOS)[number]

type EventoBase = { type?: string; action?: string; label?: string; createdAt: Date | string }

export function grupoEvento(evento: EventoBase): GrupoHistorial {
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

/** "compras,pagos" → grupos conocidos (los desconocidos se descartan). */
export function gruposValidos(valor: string | null | undefined): GrupoHistorial[] {
  const lista = String(valor || '').split(',').map(item => item.trim())
  return [...new Set(lista.filter((item): item is GrupoHistorial => (GRUPOS as readonly string[]).includes(item)))]
}

/** Fecha válida desde un parámetro `YYYY-MM-DD`/ISO; null si no se puede leer. */
export function fechaParametro(valor: string | null | undefined, finDeDia = false): Date | null {
  const texto = String(valor || '').trim()
  if (!texto) return null
  const fecha = new Date(/^\d{4}-\d{2}-\d{2}$/.test(texto) ? `${texto}T${finDeDia ? '23:59:59.999' : '00:00:00.000'}Z` : texto)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}

export function filtrarEventos<T extends EventoBase>(eventos: T[], opciones: { grupos?: GrupoHistorial[]; desde?: Date | null; hasta?: Date | null }): T[] {
  const { grupos = [], desde = null, hasta = null } = opciones
  return eventos.filter(evento => {
    if (grupos.length && !grupos.includes(grupoEvento(evento))) return false
    const tiempo = new Date(evento.createdAt).getTime()
    if (desde && tiempo < desde.getTime()) return false
    if (hasta && tiempo > hasta.getTime()) return false
    return true
  })
}

type PedidoResumen = { status: string; totalPyg: bigint | number | string; createdAt: Date | string }

/** Gastado, ticket promedio, última compra y frecuencia (pedidos no anulados). */
export function resumenCompras(pedidos: PedidoResumen[]) {
  const validos = pedidos.filter(pedido => pedido.status !== 'CANCELLED')
  const fechas = validos.map(pedido => new Date(pedido.createdAt).getTime()).filter(Number.isFinite).sort((a, b) => a - b)
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
