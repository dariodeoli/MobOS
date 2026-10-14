// Origen visible de una cotización (#401): «Cambios Chaco · venta · 14:05», con
// «desactualizada» cuando el servicio sirvió el último valor conocido, o
// «Manual · Ana · 14:05» cuando alguien la escribió a mano. Sin React ni API
// para poder testearlo.

const ZONA = 'America/Asuncion'

/** Hora local de Paraguay (HH:MM) de un ISO; vacío si no se entiende. */
export function horaAsuncion(iso) {
  const ms = Date.parse(iso || '')
  if (Number.isNaN(ms)) return ''
  return new Intl.DateTimeFormat('es-PY', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONA }).format(new Date(ms))
}

/** Etiqueta de una cotización automática traída del servicio (respuesta de GET /api/fx). */
export function etiquetaCotizacion(info) {
  if (!info) return ''
  const partes = [info.sourceLabel || info.source, info.side, horaAsuncion(info.updatedAt || info.fetchedAt)].filter(Boolean)
  const base = partes.join(' · ')
  return info.stale ? `${base} · desactualizada` : base
}

/** Marca de una cotización escrita a mano: quién y cuándo. */
export function origenManual(quien, cuando = new Date()) {
  return { manual: true, by: String(quien || '').trim() || null, at: new Date(cuando).toISOString() }
}

/** Marca de una cotización automática, para guardarla junto al pago. */
export function origenAutomatico(info) {
  return { manual: false, source: info.source, side: info.side, label: etiquetaCotizacion(info), stale: Boolean(info.stale), at: info.updatedAt || info.fetchedAt || null }
}

export function etiquetaOrigen(origen) {
  if (!origen) return ''
  if (origen.manual) return ['Manual', origen.by, horaAsuncion(origen.at)].filter(Boolean).join(' · ')
  return origen.label || ''
}

/** Lo que viaja al servidor junto al pago; el servidor solo guarda manual/fuente/lado/hora. */
export function origenParaServidor(origen) {
  if (!origen) return undefined
  if (origen.manual) return { manual: true, at: origen.at || null }
  return origen.source && origen.side ? { manual: false, source: origen.source, side: origen.side, at: origen.at || null } : undefined
}
