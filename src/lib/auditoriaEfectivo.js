// Borradores de la auditoría de efectivo (#161/#199). Al refrescar la lista no
// se pisa lo que la persona ya eligió: se conserva el borrador existente y solo
// se agregan las operaciones nuevas.

export function claveDeOperacion(operacion) {
  return `${operacion?.kind || ''}:${operacion?.id || ''}`
}

export function borradorInicial(operacion) {
  return { status: operacion?.status || 'PENDING', note: operacion?.notaAuditoria || '' }
}

export function inicializarBorradores(operaciones = [], actuales = {}) {
  const borradores = actuales && typeof actuales === 'object' ? actuales : {}
  return Object.fromEntries((Array.isArray(operaciones) ? operaciones : []).map((operacion) => {
    const clave = claveDeOperacion(operacion)
    return [clave, borradores[clave] || borradorInicial(operacion)]
  }))
}
