// Código de pedido para mostrar: los internos MOB-0001 se ven como "MOB #0001";
// cualquier otro formato (E2E-SEED-001, IT-ORDER-001…) se muestra tal cual.
// No cambia el valor guardado ni los enlaces.
export function codigoPedido(orderNumber) {
  const value = String(orderNumber ?? '').trim()
  const match = value.match(/^MOB-(\d+)$/)
  return match ? `MOB #${match[1]}` : value
}
