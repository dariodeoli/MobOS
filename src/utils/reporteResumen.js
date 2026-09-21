// Números del resumen del día (o del rango activo), compartidos por la
// pantalla (Resumen.jsx) y el papel (resumen imprimible): una sola fuente para
// que lo impreso coincida con lo que se ve. `prev` lo calcula el llamador con
// `rangoAnterior` (el módulo no conoce atajos de fecha de la UI).
import { cobradoDeVenta, comisionDeVentas, num, ticketPromedio } from './calculos.js'

const enRango = (venta, rango) => venta.fecha >= rango.desde && venta.fecha <= rango.hasta

// Productos más vendidos del período: agrupa por producto de las líneas de la
// venta (API) o, en ventas legacy/demo sin líneas, por nombre del producto.
function productosMasVendidos(ventas) {
  const acumulado = new Map()
  const sumar = (clave, nombre, cantidad, montoPyg) => {
    const fila = acumulado.get(clave) || { nombre, cantidad: 0, montoPyg: 0 }
    fila.cantidad += cantidad
    fila.montoPyg += montoPyg
    acumulado.set(clave, fila)
  }
  for (const venta of ventas) {
    const items = Array.isArray(venta.items) ? venta.items : []
    if (items.length) {
      for (const item of items) {
        const cantidad = Math.max(1, num(item.quantity || 1))
        const unitario = num(item.unitPricePyg ?? item.precio)
        sumar(item.productId || item.description || 'producto', item.description || item.nombre || 'Producto', cantidad, num(item.totalPyg ?? unitario * cantidad))
      }
    } else if (venta.productoNombre || venta.productoId) {
      sumar(venta.productoId || venta.productoNombre, venta.productoNombre || 'Producto', 1, num(venta.precio))
    }
  }
  return [...acumulado.values()].sort((a, b) => b.cantidad - a.cantidad || b.montoPyg - a.montoPyg)
}

// Mismo resultado que el tablero: totales, comparación con el período
// anterior, ranking por vendedor, medios de pago, serie diaria y productos más
// vendidos (para el papel).
export function armarResumenDia({ ventas = [], gastos = [], prods = {}, vendedoresById = {}, rango = { desde: '', hasta: '' }, prev = { desde: '', hasta: '' } } = {}) {
  const lista = Array.isArray(ventas) ? ventas : []
  const act = lista.filter((venta) => enRango(venta, rango))
  const ant = lista.filter((venta) => enRango(venta, prev))
  const gastosR = (Array.isArray(gastos) ? gastos : []).filter((gasto) => enRango(gasto, rango))

  const total = act.reduce((suma, venta) => suma + num(venta.precio), 0)
  const totalAnt = ant.reduce((suma, venta) => suma + num(venta.precio), 0)
  const comision = comisionDeVentas(act, prods)
  const delivery = act.reduce((suma, venta) => suma + num(venta.montoDelivery), 0)
  const ticket = ticketPromedio(total, act.length)
  const ticketAnt = ticketPromedio(totalAnt, ant.length)
  const cobrado = act.reduce((suma, venta) => suma + cobradoDeVenta(venta), 0)
  const pendiente = Math.max(0, total - cobrado)

  const porVend = {}
  act.forEach((venta) => {
    const clave = venta.vendedorId || 'sin'
    porVend[clave] ??= { n: 0, total: 0, com: 0 }
    porVend[clave].n += 1
    porVend[clave].total += num(venta.precio)
    porVend[clave].com += num(venta.comision ?? prods[venta.productoId]?.comision)
  })
  const ranking = Object.entries(porVend)
    .map(([id, fila]) => ({ id, nombre: vendedoresById[id] || 'Sin vendedor', ...fila }))
    .sort((a, b) => b.total - a.total)

  const porMedio = {}
  act.forEach((venta) => {
    const medio = venta.medioPago || '—'
    porMedio[medio] = (porMedio[medio] || 0) + num(venta.precio)
  })
  const medios = Object.entries(porMedio)
    .map(([medio, monto]) => ({ medio, monto, pct: total > 0 ? (monto / total) * 100 : 0 }))
    .sort((a, b) => b.monto - a.monto)

  const porDia = {}
  act.forEach((venta) => { porDia[venta.fecha] = (porDia[venta.fecha] || 0) + num(venta.precio) })
  const serie = Object.entries(porDia).sort(([a], [b]) => a.localeCompare(b))

  const pagadas = act.filter((venta) => venta.estadoPago === 'Pagado').length
  const lineasSinCosto = act.flatMap((venta) => (Array.isArray(venta.items) ? venta.items : [])).filter((item) => item.costPending === true)
  const montoSinCosto = lineasSinCosto.reduce((suma, item) => suma + num(item.totalPyg ?? num(item.unitPricePyg) * (item.quantity || 1)), 0)
  // Rentabilidad del período con la misma regla que Ganancias: se prefiere el
  // costo "foto" guardado en la venta y, si falta, el costo actual del
  // producto. La publicidad no entra acá (vive en Análisis → Ganancias).
  const costoMercaderia = act.reduce((suma, venta) => suma + num(venta.precioCosto ?? prods[venta.productoId]?.precioCosto), 0)
  const totalGastos = gastosR.reduce((suma, gasto) => suma + num(gasto.monto), 0)
  const ganancia = total - costoMercaderia - totalGastos
  // Descuentos otorgados: el extra del carrito (nivel venta) más los descuentos
  // por línea que ya vienen en el detalle.
  const descuentos = act.reduce((suma, venta) => {
    const lineas = Array.isArray(venta.items) ? venta.items : []
    return suma + num(venta.discountPyg) + lineas.reduce((parcial, item) => parcial + num(item.discountPyg), 0)
  }, 0)

  return {
    act,
    ventas: act.length,
    sinCosto: { lineas: lineasSinCosto.length, monto: montoSinCosto },
    total,
    totalAnt,
    comision,
    delivery,
    ticket,
    ticketAnt,
    cobrado,
    pendiente,
    ranking,
    medios,
    serie,
    pagadas,
    sinPagar: act.length - pagadas,
    gastos: totalGastos,
    costoMercaderia,
    ganancia,
    descuentos,
    topProductos: productosMasVendidos(act),
    prev,
  }
}
