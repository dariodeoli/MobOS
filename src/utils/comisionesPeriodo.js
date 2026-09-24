// Período pendiente de liquidar de un vendedor (#83): la liquidación arranca
// donde terminó el último corte vigente (borrador o pagada). Sin cortes,
// arranca al inicio del mes, como antes. Es pura para poder probarla sin DOM.

const VIGENTES = new Set(['DRAFT', 'PAID'])
const dia = (valor) => String(valor || '').slice(0, 10)

/** Día siguiente a una clave YYYY-MM-DD. */
export function diaSiguiente(clave) {
  const [y, m, d] = dia(clave).split('-').map(Number)
  if (!y || !m || !d) return ''
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

/**
 * Período pendiente de liquidar para `sellerId`: `desde` = día siguiente al
 * último `periodTo` vigente del vendedor (o `inicioMes` si no tiene cortes),
 * `hasta` = `hoy`. `alDia` cuando el último corte ya cubre hoy (no hay nada
 * nuevo que liquidar). Devuelve también el último corte, para explicarlo.
 */
export function periodoPendiente(liquidaciones = [], { sellerId = '', hoy = '', inicioMes = '' } = {}) {
  const vigentes = (Array.isArray(liquidaciones) ? liquidaciones : []).filter(
    (fila) => fila && fila.sellerId === sellerId && VIGENTES.has(fila.status),
  )
  const ultimo = vigentes.reduce((max, fila) => {
    const to = dia(fila.periodTo)
    if (!to) return max
    if (!max || to > max.to) return { desde: dia(fila.periodFrom), to }
    return max
  }, null)
  const desde = ultimo ? diaSiguiente(ultimo.to) : dia(inicioMes)
  return { desde, hasta: dia(hoy), alDia: Boolean(desde) && Boolean(hoy) && desde > dia(hoy), ultimo }
}
