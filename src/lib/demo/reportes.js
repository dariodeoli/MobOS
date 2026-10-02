// Reporte demo de `/api/reports` (#324): mismas fórmulas visibles que el
// backend (totales, grupos, comisiones e inventario) calculadas con las ventas
// canónicas y el catálogo local que recibe por parámetro. Sin llamadas al API.
const num = (valor) => (Number.isFinite(Number(valor)) ? Number(valor) : 0)
const fechaDeVenta = (venta) => String(venta?.fecha || venta?.creadoEn || '').slice(0, 10)
const enRango = (fecha, desde, hasta) => Boolean(fecha) && (!desde || fecha >= desde) && (!hasta || fecha <= hasta)
const redondear1 = (valor) => Math.round(num(valor) * 10) / 10

const VACIO = () => ({
  orders: 0, units: 0, grossPyg: 0, discountPyg: 0, deliveryPyg: 0, totalPyg: 0,
  collectedPyg: 0, pendingPyg: 0, costPyg: 0, profitPyg: 0, salesWithoutCostPyg: 0,
  linesWithoutCost: 0, commissionPyg: 0, netProfitPyg: 0, refundedPyg: 0,
  customers: 0, newCustomers: 0, returningCustomers: 0, ultima: '',
})

const acumular = (fila, { total, costo, cobrado, pendiente, comision, cantidad, fecha, clienteId }) => {
  fila.orders += 1
  fila.units += cantidad
  fila.grossPyg += total
  fila.totalPyg += total
  fila.collectedPyg += cobrado
  fila.pendingPyg += pendiente
  fila.costPyg += costo
  fila.profitPyg = fila.totalPyg - fila.costPyg
  fila.commissionPyg += comision
  fila.netProfitPyg = fila.profitPyg - fila.commissionPyg
  if (fecha && fecha > fila.ultima) fila.ultima = fecha
  if (clienteId) {
    fila._clientes = fila._clientes || new Set()
    fila._clientes.add(clienteId)
    fila.customers = fila._clientes.size
  }
}

const lineaDeVenta = (venta) => (Array.isArray(venta.items) && venta.items.length
  ? venta.items
  : [{ productoId: venta.productoId, description: venta.productoNombre, quantity: 1, totalPyg: num(venta.precio), category: '' }])

const costoDeLinea = (linea, venta, prod) => {
  if (prod?.precioCosto !== undefined && prod?.precioCosto !== null) return num(prod.precioCosto) * num(linea.quantity || 1)
  if (linea.productoId && venta.productoId === linea.productoId && num(venta.precioCosto) > 0) return num(venta.precioCosto)
  return 0
}

/** Reporte crudo con el contrato de `GET /api/reports` para la demo. */
export function reporteDemoMetricas({ rango = {}, groupBy = 'product', paymentsBy = '', type = '', branchId = '', ventas: ventasEntrada = [], productos = [] } = {}) {
  const desde = rango?.desde || ''
  const hasta = rango?.hasta || ''
  const generado = new Date().toISOString()
  const prodPorId = new Map(productos.map((producto) => [producto.id, producto]))
  const todas = ventasEntrada.filter((venta) => !branchId || venta.branch?.id === branchId || venta.branchId === branchId)
  const ventas = todas.filter((venta) => enRango(fechaDeVenta(venta), desde, hasta))

  // Primera compra por cliente (sobre todo el histórico) para «nuevos vs
  // habituales»: el mes del grupo se compara con esa fecha.
  const primeraCompra = new Map()
  for (const venta of todas) {
    const fecha = fechaDeVenta(venta)
    const clave = venta.clienteId || venta.cliente
    if (!clave || !fecha) continue
    if (!primeraCompra.has(clave) || fecha < primeraCompra.get(clave)) primeraCompra.set(clave, fecha)
  }

  const grupos = new Map()
  const grupoDe = (key, label) => {
    const actual = grupos.get(key) || { key, label: label || key, ...VACIO() }
    grupos.set(key, actual)
    return actual
  }
  const totales = { orders: 0, units: 0, grossPyg: 0, discountPyg: 0, deliveryPyg: 0, totalPyg: 0, collectedPyg: 0, pendingPyg: 0, costPyg: 0, profitPyg: 0, salesWithCostPyg: 0, salesWithoutCostPyg: 0, linesWithoutCost: 0, marginPct: null, commissionPyg: 0, netProfitPyg: 0, netMarginPct: null, refundedPyg: 0, paidOrders: 0, pendingOrders: 0 }

  for (const venta of ventas) {
    const lineas = lineaDeVenta(venta)
    const total = num(venta.totalPyg ?? (num(venta.precio) + num(venta.montoDelivery)))
    const subtotal = num(venta.subtotalPyg ?? venta.precio)
    const costo = num(venta.precioCosto)
    const cobrado = num(venta.totalPagado)
    const pendiente = num(venta.totalPendiente)
    const comision = num(venta.comision)
    const cantidad = lineas.reduce((suma, linea) => suma + num(linea.quantity || 1), 0)
    const fecha = fechaDeVenta(venta)
    const clienteId = venta.clienteId || venta.cliente || ''
    const datosBase = { total, costo, cobrado, pendiente, comision, cantidad, fecha, clienteId }

    totales.orders += 1
    totales.units += cantidad
    totales.grossPyg += subtotal
    totales.discountPyg += num(venta.descuento)
    totales.deliveryPyg += num(venta.montoDelivery)
    totales.totalPyg += total
    totales.collectedPyg += cobrado
    totales.pendingPyg += pendiente
    totales.costPyg += costo
    totales.commissionPyg += comision
    if (costo > 0) totales.salesWithCostPyg += total
    else { totales.salesWithoutCostPyg += total; totales.linesWithoutCost += lineas.length }
    if (pendiente <= 0) totales.paidOrders += 1
    else totales.pendingOrders += 1

    if (groupBy === 'payments') {
      for (const pago of Array.isArray(venta.pagos) ? venta.pagos : []) {
        const etiqueta = paymentsBy === 'processor'
          ? (pago.procesadora || pago.cuenta || pago.medioPago || 'Sin procesadora')
          : paymentsBy === 'account'
            ? (pago.cuenta || pago.medioPago || 'Sin cuenta')
            : (pago.medioPago || 'Sin medio')
        const fila = grupoDe(etiqueta, etiqueta)
        fila.orders += 1
        fila.grossPyg += num(pago.monto)
        fila.totalPyg += num(pago.monto)
      }
      continue
    }

    if (groupBy === 'returns') continue // La demo no registra devoluciones de pago.

    if (groupBy === 'product' || groupBy === 'category') {
      const vistos = new Set()
      for (const linea of lineas) {
        const prod = prodPorId.get(linea.productoId)
        const key = groupBy === 'product' ? (linea.productoId || String(linea.description || '')) : (linea.category || prod?.categoria || 'Sin categoría')
        const label = groupBy === 'product' ? (prod?.nombre || linea.description || key) : key
        const fila = grupoDe(key, label)
        if (!vistos.has(key)) { fila.orders += 1; vistos.add(key) }
        const unidades = num(linea.quantity || 1)
        const totalLinea = num(linea.totalPyg)
        const costoLinea = costoDeLinea(linea, venta, prod)
        fila.units += unidades
        fila.grossPyg += totalLinea
        fila.totalPyg += totalLinea
        fila.costPyg += costoLinea
        fila.profitPyg = fila.totalPyg - fila.costPyg
        fila.commissionPyg += Math.round(num(venta.comision) * (subtotal > 0 ? totalLinea / subtotal : 1))
        fila.netProfitPyg = fila.profitPyg - fila.commissionPyg
        if (costoLinea > 0) fila.salesWithCostPyg += totalLinea
        else { fila.salesWithoutCostPyg += totalLinea; fila.linesWithoutCost += 1 }
        fila.collectedPyg += Math.round(cobrado * (subtotal > 0 ? totalLinea / subtotal : 1))
        fila.pendingPyg += Math.round(pendiente * (subtotal > 0 ? totalLinea / subtotal : 1))
        if (fecha && fecha > fila.ultima) fila.ultima = fecha
      }
      continue
    }

    if (groupBy === 'seller') {
      const key = venta.vendedorId || 'sin-vendedor'
      const label = venta.seller?.name || venta.vendedorNombre || 'Sin vendedor'
      acumular(grupoDe(key, label), datosBase)
      continue
    }

    if (groupBy === 'day') {
      acumular(grupoDe(fecha, fecha), datosBase)
      continue
    }

    if (groupBy === 'branch') {
      const key = venta.branch?.id || venta.branchId || 'sin-sucursal'
      const label = venta.branch?.name || 'Sin sucursal'
      acumular(grupoDe(key, label), datosBase)
      continue
    }

    if (groupBy === 'customers') {
      acumular(grupoDe(clienteId || 'sin-cliente', venta.cliente || 'Sin cliente'), datosBase)
      continue
    }

    if (groupBy === 'newCustomers') {
      const mes = fecha.slice(0, 7)
      const fila = grupoDe(mes, mes)
      const clave = venta.clienteId || venta.cliente
      const nuevo = clave ? primeraCompra.get(clave)?.slice(0, 7) === mes : false
      acumular(fila, datosBase)
      fila.newCustomers += nuevo ? 1 : 0
      fila.returningCustomers += nuevo ? 0 : 1
      continue
    }
  }

  // Totales derivados del backend: margen y resultado neto.
  totales.profitPyg = totales.totalPyg - totales.costPyg
  totales.netProfitPyg = totales.profitPyg - totales.commissionPyg
  totales.marginPct = totales.salesWithCostPyg > 0 ? redondear1((totales.profitPyg / totales.salesWithCostPyg) * 100) : null
  totales.netMarginPct = totales.salesWithCostPyg > 0 ? redondear1((Math.max(0, totales.profitPyg - totales.commissionPyg) / totales.salesWithCostPyg) * 100) : null

  const gruposVisibles = [...grupos.values()].map((fila) => {
    const limpia = { ...fila }
    delete limpia._clientes
    return limpia
  }).sort((a, b) => b.totalPyg - a.totalPyg)

  const inventario = (() => {
    const enMano = productos.reduce((suma, producto) => suma + num(producto.stock), 0)
    const valor = productos.reduce((suma, producto) => suma + num(producto.stock) * num(producto.precioCosto), 0)
    const sinCosto = productos.filter((producto) => num(producto.stock) > 0 && num(producto.precioCosto) <= 0).length
    const vendidas = totales.units
    return {
      onHandUnits: enMano,
      soldUnits: vendidas,
      sellThroughPct: enMano + vendidas > 0 ? redondear1((vendidas / (enMano + vendidas)) * 100) : null,
      stockValuePyg: valor,
      stockWithoutCost: sinCosto,
      daysOfStock: null,
      shortages: productos.filter((producto) => num(producto.reorderPoint) > 0 && num(producto.stock) <= num(producto.reorderPoint)).map((producto) => ({ id: producto.id, name: producto.nombre, stock: num(producto.stock), reorderPoint: num(producto.reorderPoint) })),
    }
  })()

  if (type === 'commissions') {
    const sellers = gruposVisibles.map((fila) => ({
      sellerId: fila.key,
      sellerName: fila.label,
      orders: fila.orders,
      totalPyg: fila.totalPyg,
      marginPyg: fila.profitPyg,
      commissionPct: fila.profitPyg > 0 ? redondear1((fila.commissionPyg / fila.profitPyg) * 100) : null,
      commissionPyg: fila.commissionPyg,
    }))
    const totalPyg = sellers.reduce((suma, fila) => suma + fila.totalPyg, 0)
    const marginPyg = sellers.reduce((suma, fila) => suma + fila.marginPyg, 0)
    const commissionPyg = sellers.reduce((suma, fila) => suma + fila.commissionPyg, 0)
    return {
      from: desde, to: hasta, groupBy, offsetMinutes: -180, branchId: branchId || null,
      truncated: false, generatedAt: generado,
      totals: { totalPyg, marginPyg, commissionPyg, salesWithCostPyg: totales.salesWithCostPyg },
      sellers,
    }
  }

  return {
    from: desde,
    to: hasta,
    groupBy,
    offsetMinutes: -180,
    branchId: branchId || null,
    truncated: false,
    generatedAt: generado,
    inventory: inventario,
    totals: totales,
    groups: gruposVisibles,
  }
}
