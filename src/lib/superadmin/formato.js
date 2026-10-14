// Formato puro del panel de plataforma (/superadmin). Sin red ni React: se
// prueba rápido y nunca importa módulos de base de datos.
export const PERIODOS = [
  { id: 'hoy', etiqueta: 'Hoy' },
  { id: '7', etiqueta: '7 días' },
  { id: '30', etiqueta: '30 días' },
  { id: '90', etiqueta: '90 días' },
  { id: 'mes', etiqueta: 'Mes actual' },
  { id: 'mes-anterior', etiqueta: 'Mes anterior' },
]
export const PERIODO_DEFECTO = '30'

export function periodoValido(valor) {
  return PERIODOS.some(p => p.id === valor) ? valor : PERIODO_DEFECTO
}

const NUMERO = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 })
export function formatNumero(valor) {
  const n = Number(valor)
  return Number.isFinite(n) ? NUMERO.format(n) : '—'
}

/** Variación vs el período anterior: «+12,5 %», «−3 %» o «sin base» si el anterior es 0. */
export function formatDelta(delta) {
  if (delta === null || delta === undefined || !Number.isFinite(Number(delta))) return { texto: 'sin base previa', tono: 'neutro' }
  const n = Number(delta)
  const abs = Math.abs(n).toLocaleString('es-PY', { maximumFractionDigits: 1 })
  if (n === 0) return { texto: '0 %', tono: 'neutro' }
  return n > 0 ? { texto: `+${abs} %`, tono: 'sube' } : { texto: `−${abs} %`, tono: 'baja' }
}

/** Puntos de un sparkline SVG; null si no hay al menos dos puntos con algún valor. */
export function puntosSparkline(serie, ancho = 120, alto = 36, margen = 3) {
  const valores = (serie || []).map(p => Number(p?.valor ?? p) || 0)
  if (valores.length < 2 || valores.every(v => v === 0)) return null
  const max = Math.max(...valores)
  const min = Math.min(...valores)
  const rango = max - min || 1
  const paso = (ancho - margen * 2) / (valores.length - 1)
  return valores
    .map((v, i) => `${(margen + i * paso).toFixed(1)},${(alto - margen - ((v - min) / rango) * (alto - margen * 2)).toFixed(1)}`)
    .join(' ')
}

/** «2026-10-14» -> «14/10». */
export function diaCorto(dia) {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(dia || ''))
  return m ? `${m[2]}/${m[1]}` : ''
}

/** Fecha y hora en Paraguay para tablas; vacío si no hay dato. */
export function fechaHora(valor) {
  if (!valor) return ''
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return ''
  return fecha.toLocaleString('es-PY', { timeZone: 'America/Asuncion', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

export function soloFecha(valor) {
  const texto = fechaHora(valor)
  return texto ? texto.split(',')[0].trim() : ''
}

/** Querystring de listas: omite los vacíos. */
export function consultaLista(params) {
  const usp = new URLSearchParams()
  for (const [clave, valor] of Object.entries(params || {})) if (valor !== '' && valor !== null && valor !== undefined) usp.set(clave, String(valor))
  return usp.toString()
}

export function totalPaginas(total, porPagina = 30) {
  return Math.max(1, Math.ceil((Number(total) || 0) / porPagina))
}

export const ETIQUETA_ROL = { ADMIN: 'Dueño', GERENTE: 'Gerente', VENDEDOR: 'Vendedor', CAJERA: 'Cajera', TECNICO: 'Técnico', REPARTIDOR: 'Repartidor' }
export const ETIQUETA_ESTADO_USUARIO = { ACTIVE: 'Activo', INACTIVE: 'Inactivo', SUSPENDED: 'Suspendido' }
