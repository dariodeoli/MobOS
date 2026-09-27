// Transporte honesto del historial de impresión (#276). Traduce lo que reportó
// el agente —solicitado, ejecutado, fallback con motivo y conexión física— sin
// inventar: una cola CUPS no dice por dónde sale hasta leer su URI, así que sin
// dato la conexión queda vacía («—») y NUNCA se infiere USB del nombre de la
// cola. Acepta los nombres en español del historial local (`solicitado`,
// `transporte`, `conexion`) y los del backend (`requestedTransport`,
// `transport`, `physicalConnection`).
const ETIQUETA_SOLICITADO = { tcp: 'TCP', cups: 'CUPS' }
const ETIQUETA_EJECUTADO = { directo: 'TCP directo', cups: 'CUPS', usb: 'USB directo' }
const ETIQUETA_CONEXION = { lan: 'LAN', usb: 'USB', serial: 'Serial', otro: 'Otra' }

export function datosTransporte(fila = {}) {
  const solicitado = String(fila.solicitado || fila.requestedTransport || '').toLowerCase()
  const ejecutado = String(fila.transporte || fila.transport || '').toLowerCase()
  const conexion = String(fila.conexion || fila.physicalConnection || '').toLowerCase()
  return {
    solicitado: ETIQUETA_SOLICITADO[solicitado] || '',
    ejecutado: ETIQUETA_EJECUTADO[ejecutado] || (ejecutado || ''),
    fallback: fila.fallback === true,
    motivo: String(fila.motivo || fila.fallbackReason || '').trim(),
    conexion: ETIQUETA_CONEXION[conexion] || '',
  }
}

// Una línea para el title de la celda o el resumen de la prueba física.
export function resumenTransporte(fila = {}) {
  const datos = datosTransporte(fila)
  const partes = [datos.solicitado ? `solicitado ${datos.solicitado}` : '', datos.ejecutado ? `ejecutado ${datos.ejecutado}` : '', datos.conexion ? `conexión ${datos.conexion}` : ''].filter(Boolean)
  const fallback = datos.fallback ? ` · fallback: ${datos.motivo || 'sin motivo reportado'}` : ''
  return partes.join(' · ') + fallback
}
