import { garantiaDiasDemo } from './ventas.js'

// Pedido único del POS demo: los importes asignados por checkout se conservan
// por línea, pero pagos, saldo y número pertenecen al pedido completo (#487).
export function pedidoPosDemo(lineas, productos = []) {
  const items = lineas.map((linea, indice) => {
    const producto = productos.find(p => p.id === linea.productoId)
    return {
      id: `pos-item-${indice + 1}`,
      productoId: linea.productoId,
      description: linea.nombre || producto?.nombre || 'Producto',
      quantity: 1,
      unitPricePyg: linea.precio,
      totalPyg: linea.precio,
      serials: linea.sobrePedido ? [] : linea.serials || [],
      backorder: Boolean(linea.sobrePedido),
      model: producto?.atributos?.modelo || '',
      category: producto?.categoria || '',
      costPyg: Number(producto?.precioCosto || 0),
      commissionPyg: Number(producto?.comision || 0),
      ...(garantiaDiasDemo(producto?.categoria, producto?.atributos?.estado) ? { warrantyDays: garantiaDiasDemo(producto?.categoria, producto?.atributos?.estado) } : {}),
      ...(linea.couponCode ? { couponCode: linea.couponCode } : {}),
    }
  })
  const precio = items.reduce((suma, item) => suma + item.totalPyg, 0)
  const descuento = lineas.reduce((suma, linea) => suma + Number(linea.descuento || 0), 0)
  const montoDelivery = lineas.reduce((suma, linea) => suma + Number(linea.montoDelivery || 0), 0)
  return {
    productoId: items[0]?.productoId,
    productoNombre: [...new Set(items.map(item => item.description))].join(', '),
    items,
    precio,
    subtotalPyg: precio + descuento,
    descuento,
    discountPyg: descuento,
    montoDelivery,
    totalPyg: precio + montoDelivery,
    precioCosto: items.reduce((suma, item) => suma + item.costPyg, 0),
    comision: items.reduce((suma, item) => suma + item.commissionPyg, 0),
  }
}

export function stockDePedidoDemo(venta) {
  return Array.isArray(venta.items) && venta.items.length
    ? venta.items.filter(item => !item.backorder).map(item => ({ productoId: item.productoId || item.productId, quantity: Number(item.quantity || 1) }))
    : [{ productoId: venta.productoId, quantity: 1 }]
}
