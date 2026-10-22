// Crédito de una venta: misma regla que el servidor (backend/lib/credit-rules.ts).
// El servidor es la autoridad; acá solo se anticipa lo que va a pasar para avisar
// al vendedor antes de cobrar y para que la demo se comporte igual.

export const TOLERANCIAS_CREDITO = [0, 10, 20, 30]

/** Tolerancia válida: solo 0, 10, 20 o 30; cualquier otro valor cae a 0. */
export function normalizarTolerancia(valor) {
  const n = Number(valor)
  return TOLERANCIAS_CREDITO.includes(n) ? n : 0
}

/** Tope automático en enteros: floor(límite × (100 + pct) / 100). */
export function topeCredito(limite, tolerancia) {
  const lim = Math.max(0, Math.trunc(Number(limite) || 0))
  const total = lim * (100 + normalizarTolerancia(tolerancia))
  return (total - (total % 100)) / 100
}

/**
 * `deuda` es la deuda abierta del cliente SIN esta venta y `saldo` lo que esta
 * venta deja sin cobrar. Sin límite configurado el disponible es 0: toda venta
 * a crédito pide autorización. Con `tolerancia` (0/10/20/30 %) hasta el tope
 * pasa sola; `exceso` es lo que pasa del tope.
 */
export function evaluarCredito({ limite, deuda, saldo, tolerancia }) {
  const lim = Math.max(0, Math.trunc(Number(limite) || 0))
  const deu = Math.max(0, Math.trunc(Number(deuda) || 0))
  const sal = Math.max(0, Math.trunc(Number(saldo) || 0))
  const tol = lim > 0 ? normalizarTolerancia(tolerancia) : 0
  const tope = topeCredito(lim, tol)
  const disponible = Math.max(0, lim - deu)
  const disponibleTope = Math.max(0, tope - deu)
  const excesoLimite = Math.max(0, deu + sal - lim)
  const exceso = Math.max(0, deu + sal - tope)
  return {
    limite: lim, deuda: deu, saldo: sal, disponible, tolerancia: tol, tope, disponibleTope, exceso, excesoLimite,
    usaTolerancia: sal > 0 && excesoLimite > 0 && exceso === 0,
    sinLimite: lim <= 0,
    requiereAutorizacion: sal > 0 && exceso > 0,
  }
}

export const ESTADO_CREDITO = {
  PENDING: 'Pendiente de autorización de crédito',
  APPROVED: 'Crédito autorizado',
  REJECTED: 'Crédito rechazado',
}

/** ¿El pedido espera (o perdió) la autorización de crédito? No se entrega. */
export const creditoBloqueaEntrega = (order) => ['PENDING', 'REJECTED'].includes(order?.creditAuthorization?.status)

const ESTADOS_FINALES = ['DELIVERED', 'PICKED_UP']

/**
 * ¿Corresponde preguntar «¿El cliente ya se llevó el producto?» al cerrar la
 * venta? Solo en retiro en el mostrador, mientras no esté entregado ni retenido
 * por el crédito. Nunca se marca solo: el vendedor lo confirma.
 */
export function preguntaEntregaAplica(order) {
  if (!order?.id) return false
  if (creditoBloqueaEntrega(order)) return false
  if (ESTADOS_FINALES.includes(order.fulfillmentStatus)) return false
  const tipo = String(order.deliveryType || order.entrega || '').toLowerCase()
  if (tipo.includes('delivery') || tipo.includes('encomienda') || tipo.includes('envío') || tipo.includes('envio') || tipo.includes('otra sucursal')) return false
  return true
}

/** Texto del monto sobre el límite para avisos al vendedor. */
export function textoExceso(evaluacion, formato) {
  if (!evaluacion?.requiereAutorizacion) return ''
  return evaluacion.sinLimite
    ? 'El cliente no tiene crédito habilitado.'
    : `Supera el crédito disponible en ${formato(evaluacion.exceso)}.`
}
