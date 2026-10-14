// Reglas de presentación del cobro del POS sin JSX (testeables).

// Solo Delivery y Encomienda cobran envío: con cualquier otro tipo el monto
// guardado (carrito restaurado, tipo cambiado) no suma al total.
export const entregaCobraEnvio = (entrega) => entrega === 'Delivery' || entrega === 'Encomienda'

export const montoEnvioEfectivo = (entrega, monto) => (entregaCobraEnvio(entrega) ? Math.max(0, Number(monto) || 0) : 0)

// «Paga al recibir» solo oculta los pagos cuando no hay ninguno cargado: un pago
// que entra por otro camino (canje borrador, venta recuperada) nunca queda oculto.
export const pagaAlRecibirVigente = (activo, pagos) => Boolean(activo) && (pagos || []).length === 0
