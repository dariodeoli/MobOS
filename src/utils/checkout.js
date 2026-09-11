// Allocate order-level discount and payments once across legacy display lines.
// All values are integer guaraníes; the last line receives rounding remainder.
export function allocateCheckout(items, discount, delivery, payments) {
  const subtotal = items.reduce((sum, item) => sum + item.precio, 0)
  if (!items.length || !Number.isSafeInteger(subtotal) || subtotal <= 0) throw new Error('Carrito inválido.')
  if (![discount, delivery, ...payments.map(p => p.monto)].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('Montos inválidos.')
  if (discount > subtotal) throw new Error('El descuento supera el subtotal.')
  const total = subtotal - discount + delivery
  if (payments.reduce((sum, p) => sum + p.monto, 0) > total) throw new Error('Los pagos superan el total.')
  const remaining = payments.map(p => ({ ...p }))
  let allocatedDiscount = 0
  return items.map((item, index) => {
    const lineDiscount = index === items.length - 1 ? discount - allocatedDiscount : Math.floor(discount * item.precio / subtotal)
    allocatedDiscount += lineDiscount
    const shipping = index === 0 ? delivery : 0
    const lineTotal = item.precio - lineDiscount + shipping
    let unpaid = lineTotal
    const linePayments = []
    for (const payment of remaining) {
      const amount = Math.min(unpaid, payment.monto)
      if (amount > 0) linePayments.push({ ...payment, monto: amount })
      payment.monto -= amount
      unpaid -= amount
    }
    return { ...item, precio: item.precio - lineDiscount, descuento: lineDiscount, montoDelivery: shipping, total: lineTotal, pagos: linePayments }
  })
}
