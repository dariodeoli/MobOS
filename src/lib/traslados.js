// #218 · Etiquetas del tránsito de un lote de inventario: la ETA (día estimado
// de llegada) y quién despachó/recibió. Viven acá para poder testearlas sin
// montar la tabla completa.
//
// La ETA se carga con `type="date"` (regla de CAMPOS.md): el formulario manda el
// día a mediodía UTC y acá se muestra el día del calendario, sin que el huso lo
// corra. Se marca vencida recién cuando terminó el día estimado y el lote sigue
// sin recepción.
export function fechaEta(value) {
  if (!value) return null
  const fecha = new Date(value)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}

export function etiquetaEta(value, recibidoEn = null, ahora = new Date()) {
  const fecha = fechaEta(value)
  if (!fecha) return null
  const finDelDia = new Date(fecha)
  finDelDia.setHours(23, 59, 59, 999)
  const vencida = !recibidoEn && finDelDia.getTime() < new Date(ahora).getTime()
  return {
    texto: fecha.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }).replace('.', ''),
    vencida,
    detalle: `ETA: ${fecha.toLocaleDateString('es-PY')}${vencida ? ' · vencida' : ''}`,
  }
}

// Resumen «Despachó → Recibió». El despachante es quien registró el traslado;
// si la recepción fue por el QR público no hay persona con cuenta y se aclara.
export function etiquetaDespacho(transfer = {}) {
  const despacho = transfer.dispatchedBy?.name || null
  const recepcion = transfer.receivedBy?.name || null
  const texto = [despacho, recepcion].filter(Boolean).join(' → ') || '—'
  const detalle = `Despachó: ${despacho || 'sin registrar'} · Recibió: ${recepcion || (transfer.receivedAt ? 'por QR público' : 'pendiente')}`
  return { texto, detalle }
}
