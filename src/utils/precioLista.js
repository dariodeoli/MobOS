// Descuento visible de una línea vendida por debajo del precio de lista.
// Por encima de lista no se marca nada: el comprobante muestra el precio
// normal, nunca un aumento.
export function ahorroDeLinea(item = {}) {
  const quantity = Math.max(1, Number(item.quantity || 1) || 1)
  const unitPricePyg = Number(item.unitPricePyg ?? item.precio ?? 0) || 0
  const listPricePyg = Number(item.listPricePyg ?? 0) || 0
  const descuentoLista = listPricePyg > unitPricePyg ? (listPricePyg - unitPricePyg) * quantity : 0
  const descuentoLinea = Math.max(0, Number(item.discountPyg || 0) || 0)
  return { listPricePyg, unitPricePyg, descuentoLista, descuentoLinea, ahorro: descuentoLista + descuentoLinea }
}
