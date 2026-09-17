// Código de pedido para mostrar: los `PREFIX-#0001` se ven como `PREFIX #0001`
// (4 dígitos mínimos, crece); cualquier otro formato (E2E-SEED-001…) se muestra
// tal cual. No cambia el valor guardado ni los enlaces.
export function codigoPedido(orderNumber) {
  const value = String(orderNumber ?? '').trim()
  const match = value.match(/^([A-Z]{2,3})[- ]?#?(\d+)$/)
  return match ? `${match[1]} #${String(match[2]).padStart(4, '0')}` : value
}
