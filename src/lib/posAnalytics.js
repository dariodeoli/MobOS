// Métricas del POS (sección 20 de la épica #148): se calculan en el navegador
// sobre los pedidos que ya viajan por la API. Puro y testeable: recibe filas
// (con totalPyg, payments, items, seller, branch) y dos días, devuelve el
// tablero del POS.
import { fechaClave } from '../utils/calculos.js'

const totalDe = (orden) => Number(orden?.totalPyg ?? orden?.total ?? 0)
const descuentoDe = (orden) => Number(orden?.discountPyg ?? orden?.descuento ?? 0)
const pagadoDe = (orden) =>
  (Array.isArray(orden?.payments) ? orden.payments : [])
    .filter((pago) => pago?.status === 'CONFIRMED' || pago?.status === undefined)
    .reduce((suma, pago) => suma + Number(pago.amountPyg ?? pago.monto ?? 0), 0)
const unidadesDe = (orden) =>
  (Array.isArray(orden?.items) ? orden.items : []).reduce((suma, item) => suma + (Number(item.quantity) || 1), 0)
const vivo = (orden) => orden?.status !== 'CANCELLED'

// Clave de día local (YYYY-MM-DD) de una fecha ISO.
export const diaDe = (valor) => {
  if (!valor) return ''
  const fecha = new Date(valor)
  return Number.isNaN(fecha.getTime()) ? '' : fechaClave(fecha)
}

const vacio = () => ({ ventas: 0, pedidos: 0, unidades: 0, neto: 0, descuentos: 0, aov: 0, itemsPorPedido: 0, cobrado: 0, pendiente: 0 })

function resumenDelDia(ordenes) {
  const filas = ordenes.filter(vivo)
  const ventas = filas.reduce((suma, orden) => suma + totalDe(orden), 0)
  const descuentos = filas.reduce((suma, orden) => suma + descuentoDe(orden), 0)
  const cobrado = filas.reduce((suma, orden) => suma + pagadoDe(orden), 0)
  const unidades = filas.reduce((suma, orden) => suma + unidadesDe(orden), 0)
  const pedidos = filas.length
  return {
    ventas,
    pedidos,
    unidades,
    // El total de cada pedido ya viene neto de descuentos: `neto` es lo que
    // entra por ventas (sin devoluciones, que se anulan) y `bruto` agrega los
    // descuentos otorgados para ver cuánto se resignó.
    neto: ventas,
    bruto: ventas + descuentos,
    descuentos,
    aov: pedidos ? Math.round(ventas / pedidos) : 0,
    itemsPorPedido: pedidos ? Number((unidades / pedidos).toFixed(2)) : 0,
    cobrado,
    pendiente: Math.max(0, ventas - cobrado),
  }
}

function agrupar(ordenes, claveDe, etiquetaDe) {
  const mapa = new Map()
  for (const orden of ordenes.filter(vivo)) {
    const clave = claveDe(orden) || 'sin-dato'
    const actual = mapa.get(clave) || { clave, etiqueta: etiquetaDe(orden, clave), ventas: 0, pedidos: 0 }
    actual.ventas += totalDe(orden)
    actual.pedidos += 1
    mapa.set(clave, actual)
  }
  return [...mapa.values()].sort((a, b) => b.ventas - a.ventas)
}

function topProductos(ordenes, limite = 8) {
  const mapa = new Map()
  for (const orden of ordenes.filter(vivo)) {
    for (const item of Array.isArray(orden?.items) ? orden.items : []) {
      const clave = item?.productId || item?.description || 'producto'
      const actual = mapa.get(clave) || { clave, nombre: item?.description || 'Producto', unidades: 0, ventas: 0 }
      actual.unidades += Number(item?.quantity) || 1
      actual.ventas += Number(item?.totalPyg ?? (Number(item?.unitPricePyg) || 0) * (Number(item?.quantity) || 1))
      mapa.set(clave, actual)
    }
  }
  return [...mapa.values()].sort((a, b) => b.ventas - a.ventas).slice(0, limite)
}

function pagosPorTipo(ordenes) {
  const mapa = new Map()
  for (const orden of ordenes.filter(vivo)) {
    for (const pago of Array.isArray(orden?.payments) ? orden.payments : []) {
      if (!(pago?.status === 'CONFIRMED' || pago?.status === undefined)) continue
      const clave = pago.method || pago.medioPago || 'Otro'
      const actual = mapa.get(clave) || { clave, etiqueta: pago.method || pago.medioPago || 'Otro', monto: 0, pagos: 0 }
      actual.monto += Number(pago.amountPyg ?? pago.monto ?? 0)
      actual.pagos += 1
      mapa.set(clave, actual)
    }
  }
  return [...mapa.values()].sort((a, b) => b.monto - a.monto)
}

// Tablero del POS: hoy vs ayer + desgloses del día de hoy.
export function tableroPos(ordenes, { hoy = fechaClave(), ayer } = {}) {
  const delDia = (ordenes || []).filter((orden) => diaDe(orden?.createdAt || orden?.fecha || orden?.date) === hoy)
  const diaAyer = ayer ?? (() => {
    const fecha = new Date(`${hoy}T12:00:00`)
    fecha.setDate(fecha.getDate() - 1)
    return fechaClave(fecha)
  })()
  const previas = (ordenes || []).filter((orden) => diaDe(orden?.createdAt || orden?.fecha || orden?.date) === diaAyer)
  return {
    hoy: resumenDelDia(delDia),
    ayer: resumenDelDia(previas),
    topProductos: topProductos(delDia),
    porVendedor: agrupar(delDia, (orden) => orden?.seller?.id || orden?.sellerId, (orden, clave) => orden?.seller?.name || clave),
    porSucursal: agrupar(delDia, (orden) => orden?.branch?.id || orden?.branchId, (orden, clave) => orden?.branch?.name || clave),
    pagos: pagosPorTipo(delDia),
  }
}

export const comparacion = (actual, previo) => {
  const a = Number(actual) || 0
  const b = Number(previo) || 0
  if (!b) return a > 0 ? 100 : 0
  return Math.round(((a - b) / b) * 100)
}

export { vacio as resumenVacio }
