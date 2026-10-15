// Verificación de stock («¿está físicamente?»): partes puras compartidas por la
// pantalla, la demo y los tests. Espejo de backend/lib/stock-verification.ts.

export const VENTANA_DESHACER_MS = 60_000
export const ESTADOS_ESPERADOS = ['AVAILABLE', 'RESERVED', 'DEFECTIVE']

export const MOTIVO_INESPERADA = {
  OTHER_BRANCH: 'Es de otra sucursal',
  OTHER_LOCATION: 'Es de otro depósito',
  SOLD: 'Figura vendida',
  IN_TRANSIT: 'Figura en tránsito',
  REMOVED: 'Está dada de baja',
  UNKNOWN: 'No figura en el stock',
}

/** El check de la fila se puede deshacer solo si es tuyo y tiene menos de 1 minuto. */
export function puedeDeshacerVerificacion(item, usuarioId, ahora = Date.now()) {
  if (!item || item.kind === 'product' || !usuarioId || !item.lastVerifiedAt || item.verifiedById !== usuarioId) return false
  const desde = new Date(item.lastVerifiedAt).getTime()
  return Number.isFinite(desde) && ahora - desde <= VENTANA_DESHACER_MS && ahora >= desde - 1000
}

/** Milisegundos que quedan para deshacer (0 si ya no se puede). */
export function msParaDeshacer(lastVerifiedAt, ahora = Date.now()) {
  const desde = new Date(lastVerifiedAt).getTime()
  return Number.isFinite(desde) ? Math.max(0, VENTANA_DESHACER_MS - (ahora - desde)) : 0
}

/** Una lectura es verificada si la unidad está en el alcance de la sesión; si no, inesperada con motivo. */
export function clasificarEscaneo(unidad, { branchId, locationId = null }) {
  if (!unidad) return { outcome: 'UNEXPECTED', reason: 'UNKNOWN' }
  if (unidad.removedAt) return { outcome: 'UNEXPECTED', reason: 'REMOVED' }
  if (unidad.status === 'SOLD') return { outcome: 'UNEXPECTED', reason: 'SOLD' }
  if (unidad.status === 'IN_TRANSIT') return { outcome: 'UNEXPECTED', reason: 'IN_TRANSIT' }
  if (unidad.branchId !== branchId) return { outcome: 'UNEXPECTED', reason: 'OTHER_BRANCH' }
  if (locationId && unidad.locationId !== locationId) return { outcome: 'UNEXPECTED', reason: 'OTHER_LOCATION' }
  return ESTADOS_ESPERADOS.includes(unidad.status) ? { outcome: 'VERIFIED' } : { outcome: 'UNEXPECTED', reason: 'UNKNOWN' }
}

/** Resumen vivo: esperadas vs. vistas; las inesperadas no cuentan como verificadas. */
export function resumirVerificacion(seriesEsperadas = [], escaneos = []) {
  const esperadas = new Set(seriesEsperadas)
  const vistas = new Set(escaneos.filter((escaneo) => escaneo.outcome === 'VERIFIED').map((escaneo) => escaneo.serial))
  const pendientes = [...esperadas].filter((serie) => !vistas.has(serie)).sort()
  const verificadas = esperadas.size - pendientes.length
  const inesperadas = new Set(escaneos.filter((escaneo) => escaneo.outcome === 'UNEXPECTED').map((escaneo) => escaneo.serial)).size
  return { expected: esperadas.size, verified: verificadas, missing: pendientes.length, unexpected: inesperadas, pending: pendientes, percent: esperadas.size ? Math.round((verificadas / esperadas.size) * 100) : 100 }
}
