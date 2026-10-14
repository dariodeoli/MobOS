import { errorCorreccion } from '@/utils/correccionPago'

// Corrección de pagos ficticia de la demo (#393): arma, sobre las filas de pago
// del pedido demo, lo mismo que el endpoint real — el original queda intacto
// (se marca «revertido» por su reversión), una reversión negativa del mismo
// medio y los pagos nuevos con el motivo. La demo no llama a la API.

const montoDe = (pago) => Number(pago.amountPyg ?? pago.monto ?? 0)
const nuevoId = () => (globalThis.crypto?.randomUUID?.() || `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`)

/**
 * Devuelve `{ pagos, totalPagado, totalPendiente, estadoPago }` del pedido tras
 * corregir `original`. Lanza Error con mensaje en español si no se puede.
 */
export function corregirPagoDemo({ pedido, original, motivo, filas, cuentas = [], repartidor = false }) {
  const pagos = pedido.pagos || []
  if (!original || !pagos.some((pago) => pago.id === original.id)) throw new Error('No se encontró el pago a corregir.')
  if (pagos.some((pago) => pago.reversalOfId === original.id)) throw new Error('Este pago ya fue corregido.')
  const problema = errorCorreccion({ original: { amountPyg: montoDe(original) }, filas, motivo })
  if (problema) throw new Error(problema)
  const correctionId = nuevoId()
  const ahora = new Date().toISOString()
  const motivoLimpio = String(motivo).trim()
  const reversion = {
    ...original, id: nuevoId(), amountPyg: -montoDe(original), monto: -montoDe(original),
    reversalOfId: original.id, correctionId, correctionReason: motivoLimpio, fecha: ahora, status: 'CONFIRMED',
    reconciliationState: undefined,
  }
  let aRepartidor = 0
  const nuevos = filas.map((fila) => {
    const cuenta = cuentas.find((item) => item.id === fila.accountId)
    if (!cuenta) throw new Error('La cuenta elegida no existe o está inactiva.')
    if (cuenta.currency && cuenta.currency !== 'PYG') throw new Error('Solo se corrigen pagos en guaraníes.')
    const alRepartidor = !!fila.toDriver
    if (alRepartidor) {
      if (!repartidor) throw new Error('El pedido no tiene repartidor asignado para recibir ese efectivo.')
      if (cuenta.kind !== 'CASH') throw new Error('Solo el efectivo puede quedar en poder del repartidor.')
      aRepartidor += Number(fila.amount)
    }
    return {
      id: nuevoId(), method: cuenta.kind, medioPago: cuenta.name, cuenta: cuenta.name, accountId: cuenta.id,
      amountPyg: Number(fila.amount), monto: Number(fila.amount), currency: 'PYG', fecha: ahora,
      correctionId, correctionReason: motivoLimpio,
      status: alRepartidor ? 'PENDING' : 'CONFIRMED',
      reconciliationState: 'PENDING',
      ...(alRepartidor ? { deliveryUserId: pedido.assignedToId } : {}),
    }
  })
  if (nuevos.length === 1 && !nuevos[0].deliveryUserId && original.accountId && nuevos[0].accountId === original.accountId) {
    throw new Error('El pago nuevo es igual al original: elegí otro medio o cuenta.')
  }
  const totalPagado = Number(pedido.totalPagado || 0) - aRepartidor
  const totalPendiente = Number(pedido.totalPendiente || 0) + aRepartidor
  return {
    pagos: [...pagos, reversion, ...nuevos],
    totalPagado,
    totalPendiente,
    ...(aRepartidor > 0 ? { estadoPago: totalPagado > 0 ? 'Parcial' : 'Pendiente' } : {}),
  }
}
