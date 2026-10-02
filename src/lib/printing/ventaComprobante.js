// Comprobante de venta: una sola fuente de verdad del pedido real (#318).
//
// El mismo pedido circula por la app en tres formas: la orden completa del API,
// la fila del listado (proyección plana del vendedor) y la venta local del modo
// demo (campos legacy: `cliente`, `productoNombre`, `precio`). Este módulo las
// normaliza a la forma que consumen el HTML y el ticket ESC/POS y resuelve lo
// que falta desde la venta real —nunca desde un placeholder—: empresa, cliente,
// número, artículos y totales.
//
// Las funciones son puras: quien las usa aporta las líneas locales del pedido,
// el catálogo y la ficha del cliente cuando las tiene (`ventaComprobanteLocal`).
// Así el comprobante impreso coincide con la venta que se ve en pantalla.

const texto = (valor) => String(valor ?? '').trim()
const numero = (valor) => {
  const n = Number(valor)
  return Number.isFinite(n) ? n : 0
}

// Un artículo en la forma que esperan el HTML y el ticket: descripción,
// cantidad, unitario y total. Acepta la forma del API (unitPricePyg/totalPyg) y
// la legacy del demo (precio). Si falta uno de los dos importes, lo deriva del
// otro para no imprimir 0 en una venta que sí tiene precio.
export function normalizarItem(item = {}, indice = 0) {
  const cantidad = numero(item.quantity ?? item.cantidad) || 1
  const unitarioCrudo = Number(item.unitPricePyg ?? item.precio ?? item.precioUnitarioPyg ?? NaN)
  const totalCrudo = Number(item.totalPyg ?? item.total ?? NaN)
  const unitario = Number.isFinite(unitarioCrudo) && unitarioCrudo > 0
    ? unitarioCrudo
    : Number.isFinite(totalCrudo) && totalCrudo > 0
      ? totalCrudo / cantidad
      : 0
  const total = Number.isFinite(totalCrudo) ? totalCrudo : cantidad * unitario
  const descuento = numero(item.discountPyg ?? item.descuento)
  return {
    ...item,
    id: item.id || `item-${indice + 1}`,
    description: texto(item.description || item.nombre || item.productoNombre || item.productName) || 'Producto',
    quantity: cantidad,
    unitPricePyg: unitario,
    totalPyg: total,
    ...(descuento ? { discountPyg: descuento } : {}),
  }
}

// La ficha del cliente (nombre, teléfono, documento, direcciones). La orden del
// API trae `customer` como objeto; la fila del listado como string con el
// nombre; la venta demo como `cliente`. Nunca se pisa un dato del pedido con la
// ficha: el pedido manda y la ficha completa lo que falta.
export function clienteDeVenta(venta = {}, ficha = null) {
  const base = venta.customer && typeof venta.customer === 'object' ? { ...venta.customer } : {}
  const id = venta.customerId || venta.clienteId || base.id || null
  const completa = ficha && id && String(ficha.id) === String(id) ? ficha : null
  const fusionado = { ...(completa || {}), ...base }
  const nombre = texto(
    fusionado.name ||
    (typeof venta.customer === 'string' ? venta.customer : '') ||
    venta.cliente ||
    venta.customerName,
  )
  if (!nombre) return { name: 'Consumidor final' }
  return { ...fusionado, id: fusionado.id || id, name: nombre }
}

// Los artículos reales: los del pedido; si no están (venta legacy o fila del
// listado), una línea por venta local del mismo pedido; como último recurso, el
// resumen de productos de la fila con su total. Sin datos no inventa ítems.
export function itemsDeVenta(venta = {}, lineas = [], productos = {}) {
  const propias = Array.isArray(venta.items) ? venta.items.filter(Boolean) : []
  if (propias.length) return propias.map(normalizarItem)

  const locales = (Array.isArray(lineas) ? lineas : []).filter(Boolean)
  if (locales.length) {
    return locales.map((linea, indice) => normalizarItem({
      ...linea,
      description: linea.productoNombre || linea.description || productos[linea.productoId]?.nombre || productos[linea.productoId]?.name,
    }, indice))
  }

  // Venta legacy suelta (sin líneas locales): el propio registro trae producto
  // y precio; se imprime esa línea real.
  const descripcionPropia = texto(venta.productoNombre || venta.nombre)
  if (descripcionPropia) {
    const cantidad = numero(venta.quantity) || 1
    const unitario = numero(venta.precio ?? venta.unitPricePyg)
    return [normalizarItem({ id: venta.id, description: descripcionPropia, quantity: cantidad, unitPricePyg: unitario, totalPyg: cantidad * unitario }, 0)]
  }

  const resumen = texto(venta.products || venta.productos)
  if (!resumen) return []
  const cantidad = numero(venta.quantity) || 1
  const bruto = numero(venta.totalPyg ?? venta.total) -
    numero(venta.deliveryPyg ?? venta.montoDelivery)
  return [normalizarItem({ description: resumen, quantity: cantidad, totalPyg: bruto }, 0)]
}

// Los pagos del pedido; si el pedido no los trae, los de sus líneas locales
// (una venta demo expande una línea por unidad y reparte los pagos entre ellas).
export function pagosDeVenta(venta = {}, lineas = []) {
  const propios = Array.isArray(venta.payments) ? venta.payments : Array.isArray(venta.pagos) ? venta.pagos : []
  if (propios.length) return propios
  const vistos = new Set()
  return (Array.isArray(lineas) ? lineas : []).flatMap((linea) => {
    const pagos = Array.isArray(linea?.pagos) ? linea.pagos : []
    return pagos.filter((pago) => {
      const clave = pago?.id || `${pago?.medioPago}|${pago?.monto}|${pago?.fecha}`
      if (vistos.has(clave)) return false
      vistos.add(clave)
      return true
    })
  })
}

// La empresa que vendió: el tenant del pedido manda; el contexto de la sesión
// (modo demo, pedido de una fila sin tenant) lo completa.
export function tenantDeVenta(venta = {}, contexto = {}) {
  if (venta.tenant && typeof venta.tenant === 'object') return venta.tenant
  const empresa = contexto.empresa
  if (empresa && typeof empresa === 'object') {
    const nombre = texto(empresa.nombre || empresa.name)
    return nombre ? { ...empresa, name: nombre } : null
  }
  const nombre = texto(typeof empresa === 'string' ? empresa : venta.empresaNombre || venta.empresa)
  return nombre ? { name: nombre } : null
}

// La sucursal y el vendedor del pedido; el contexto de la sesión los completa
// cuando la fila del listado los perdió.
export function sucursalDeVenta(venta = {}, contexto = {}) {
  if (venta.branch && typeof venta.branch === 'object') return venta.branch
  const sucursal = contexto.sucursal
  if (!sucursal || typeof sucursal !== 'object') return null
  const name = texto(sucursal.nombre || sucursal.name)
  return name ? { ...sucursal, name } : null
}

export function vendedorDeVenta(venta = {}, contexto = {}) {
  if (venta.seller && typeof venta.seller === 'object') return venta.seller
  const nombre = texto(venta.sellerName || contexto.vendedor)
  return nombre ? { name: nombre } : null
}

/**
 * Convierte cualquier forma de pedido en el documento del comprobante.
 * Es idempotente: normalizar un documento ya normalizado no cambia nada.
 *
 * @param {object} venta Pedido/venta real (API, fila del listado o demo).
 * @param {object} [contexto] `empresa`, `sucursal`, `vendedor`, `cliente`
 *   (ficha) y `lineas` (ventas locales del mismo pedido) + `productos`.
 */
export function documentoComprobante(venta = null, contexto = {}) {
  if (!venta || typeof venta !== 'object') return {}
  const lineas = Array.isArray(contexto.lineas) ? contexto.lineas : []
  const productos = contexto.productos && typeof contexto.productos === 'object' ? contexto.productos : {}
  const items = itemsDeVenta(venta, lineas, productos)
  const payments = pagosDeVenta(venta, lineas)
  const brutoItems = items.reduce((suma, item) => suma + numero(item.totalPyg), 0)
  const totalPyg = numero(venta.totalPyg ?? venta.total ?? venta.precio) || brutoItems
  const deliveryPyg = numero(venta.deliveryPyg ?? venta.montoDelivery)
  const discountPyg = numero(venta.discountPyg ?? venta.descuento)
  const subtotalPyg = numero(venta.subtotalPyg) || brutoItems || Math.max(0, totalPyg - deliveryPyg)
  const customer = clienteDeVenta(venta, contexto.cliente)
  const tenant = tenantDeVenta(venta, contexto)
  const branch = sucursalDeVenta(venta, contexto)
  const seller = vendedorDeVenta(venta, contexto)
  const orderNumber = texto(venta.orderNumber || venta.codigo || venta.number || venta.numero || lineas[0]?.orderNumber)
  // La fila del listado guarda la fecha en `date`: se unifica para que el
  // comprobante imprima la misma fecha que muestra la pantalla.
  const cuando = texto(venta.createdAt || venta.creadoEn || venta.date || venta.fecha)

  return {
    ...venta,
    ...(orderNumber ? { orderNumber } : {}),
    ...(cuando ? { creadoEn: cuando } : {}),
    id: venta.id || null,
    customer,
    cliente: customer.name,
    items,
    payments,
    pagos: payments,
    totalPyg,
    subtotalPyg,
    deliveryPyg,
    discountPyg,
    ...(tenant ? { tenant } : {}),
    ...(branch ? { branch } : {}),
    ...(seller ? { seller } : {}),
  }
}
