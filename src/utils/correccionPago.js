// Reglas de la UI para corregir el medio de un pago ya cobrado (#393). La
// política real vive en el backend (payment-correction-policy.ts); acá solo se
// decide si mostrar la acción «Corregir» y se calcula el resto por repartir. El
// servidor revalida todo y su mensaje manda cuando difiere (403/409/422).

const GERENCIA = ['ADMIN', 'GERENTE']
const PERSONAL = ['VENDEDOR', 'CAJERA']
const MEDIOS_FUERA_DE_ALCANCE = ['TRADE_IN', 'STORE_CREDIT', 'GIFT_CARD', 'CREDIT', 'CRYPTO']

export const MOTIVO_MIN = 3
export const MOTIVO_MAX = 500

const monto = (pago) => Number(pago?.amountPyg ?? pago?.monto ?? 0)
const medio = (pago) => String(pago?.method || '').toUpperCase()

/** Fila de reversión (negativa) o pago nacido de una corrección. */
export const esReversion = (pago) => !!pago?.reversalOfId
export const esDeCorreccion = (pago) => !!pago?.correctionId && !pago?.reversalOfId

/** Mapa pagoOriginalId → reversión, para marcar «revertido» y enlazar. */
export function reversionesPorOriginal(pagos = []) {
  const mapa = new Map()
  for (const pago of pagos) if (pago?.reversalOfId) mapa.set(pago.reversalOfId, pago)
  return mapa
}

/**
 * ¿Se ofrece «Corregir» en este pago? `motivo` explica por qué no (null si sí).
 * No conoce el turno de caja: eso lo decide el servidor (403 con su mensaje).
 */
export function evaluarCorreccionPago({ pago, pagos = [], pedido, usuario, personalPuede = true, conciliacion = null, esDemo = false }) {
  const rol = usuario?.role
  if (!GERENCIA.includes(rol) && !PERSONAL.includes(rol)) return { puede: false, motivo: 'Tu rol no puede corregir pagos.' }
  if (!pago || (pago.status && pago.status !== 'CONFIRMED')) return { puede: false, motivo: 'Solo se corrigen pagos confirmados.' }
  if (pago.reversalOfId || pago.correctionId) return { puede: false, motivo: 'Es parte de una corrección: corregí el pago original.' }
  if (pagos.some((otro) => otro?.reversalOfId === pago.id)) return { puede: false, motivo: 'Este pago ya fue corregido.' }
  if (pago.deliveryUserId || pago.deliverySettlementId) return { puede: false, motivo: 'Los cobros del repartidor se concilian con su rendición.' }
  if (pago.dueAt) return { puede: false, motivo: 'Las cuotas no se pueden corregir.' }
  if (MEDIOS_FUERA_DE_ALCANCE.includes(medio(pago))) return { puede: false, motivo: 'Este medio de pago no se puede corregir todavía.' }
  if (pago.currency && pago.currency !== 'PYG') return { puede: false, motivo: 'Solo se corrigen pagos en guaraníes.' }
  if (monto(pago) <= 0) return { puede: false, motivo: 'Este pago no tiene un monto corregible.' }
  if (pedido?.status === 'CANCELLED') return { puede: false, motivo: 'El pedido está anulado.' }
  if (conciliacion === 'VERIFIED' && rol !== 'ADMIN') return { puede: false, motivo: 'El pago está verificado: solo el dueño puede corregirlo.' }
  if (PERSONAL.includes(rol)) {
    if (!personalPuede) return { puede: false, motivo: 'El dueño no habilitó que caja y vendedores corrijan pagos.' }
    if (!esDemo && pago.userId !== usuario.id && pago.createdById !== usuario.id) return { puede: false, motivo: 'Solo podés corregir pagos que cobraste vos.' }
  }
  return { puede: true, motivo: null }
}

/** Solo administración/gerencia deja efectivo al repartidor, y con repartidor asignado. */
export const puedeDejarAlRepartidor = (usuario, pedido) => GERENCIA.includes(usuario?.role) && !!pedido?.assignedToId

export const restanteCorreccion = (original, filas = []) =>
  monto(original) - filas.reduce((suma, fila) => suma + (Number(fila.amount) || 0), 0)

/** Mensaje de lo que falta para poder enviar (null = listo). */
export function errorCorreccion({ original, filas, motivo }) {
  const texto = String(motivo || '').trim()
  if (texto.length < MOTIVO_MIN) return `El motivo necesita al menos ${MOTIVO_MIN} caracteres.`
  if (texto.length > MOTIVO_MAX) return `El motivo admite hasta ${MOTIVO_MAX} caracteres.`
  if (!filas.length) return 'Agregá al menos un pago nuevo.'
  if (filas.some((fila) => !fila.accountId)) return 'Elegí la cuenta de cada pago nuevo.'
  if (filas.some((fila) => !(Number(fila.amount) > 0))) return 'Cada pago nuevo necesita un monto mayor a cero.'
  if (restanteCorreccion(original, filas) !== 0) return 'Los pagos nuevos deben sumar exactamente el monto original.'
  return null
}

/** Cuerpo exacto que espera POST …/correction. */
export function cuerpoCorreccion({ motivo, filas }) {
  return {
    reason: String(motivo).trim(),
    payments: filas.map((fila) => ({ accountId: fila.accountId, amount: Number(fila.amount), ...(fila.toDriver ? { toDriver: true } : {}) })),
  }
}
