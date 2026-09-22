// Métricas del POS (sección 20 de la épica #148): se calculan en el navegador
// sobre los pedidos que ya viajan por la API. Puro y testeable: recibe filas
// (con totalPyg, payments, items, seller, branch) y dos días, devuelve el
// tablero del POS.
import { fechaClave } from '../utils/calculos.js'
import { paymentMethodLabel } from './constants.js'

const totalDe = (orden) => Number(orden?.totalPyg ?? orden?.total ?? 0)
const descuentoDe = (orden) => Number(orden?.discountPyg ?? orden?.descuento ?? 0)
const pagadoDe = (orden) =>
  (Array.isArray(orden?.payments) ? orden.payments : [])
    .filter((pago) => pago?.status === 'CONFIRMED' || pago?.status === undefined)
    .reduce((suma, pago) => suma + Number(pago.amountPyg ?? pago.monto ?? 0), 0)
const unidadesDe = (orden) =>
  (Array.isArray(orden?.items) ? orden.items : []).reduce((suma, item) => suma + (Number(item.quantity) || 1), 0)
const vivo = (orden) => orden?.status !== 'CANCELLED'

// Efectivo del período (#148 §18): cobros CASH confirmados menos reembolsados.
const efectivoDe = (ordenes) =>
  ordenes.filter(vivo).reduce((suma, orden) => suma + (Array.isArray(orden?.payments) ? orden.payments : []).reduce((parcial, pago) => {
    if ((pago?.method || pago?.medioPago) !== 'CASH') return parcial
    const monto = Number(pago.amountPyg ?? pago.monto ?? 0)
    if (pago?.status === 'REFUNDED') return parcial - monto
    if (pago?.status === 'CONFIRMED' || pago?.status === undefined) return parcial + monto
    return parcial
  }, 0), 0)

// Reembolsos del período, de cualquier medio.
const reembolsadoDe = (ordenes) =>
  ordenes.filter(vivo).reduce((suma, orden) => suma + (Array.isArray(orden?.payments) ? orden.payments : [])
    .filter((pago) => pago?.status === 'REFUNDED')
    .reduce((parcial, pago) => parcial + Number(pago.amountPyg ?? pago.monto ?? 0), 0), 0)

// Clave de día local (YYYY-MM-DD) de una fecha ISO.
export const diaDe = (valor) => {
  if (!valor) return ''
  const fecha = new Date(valor)
  return Number.isNaN(fecha.getTime()) ? '' : fechaClave(fecha)
}

const vacio = () => ({ ventas: 0, pedidos: 0, unidades: 0, neto: 0, descuentos: 0, aov: 0, itemsPorPedido: 0, cobrado: 0, pendiente: 0, efectivo: 0, reembolsado: 0 })

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
    efectivo: efectivoDe(filas),
    reembolsado: reembolsadoDe(filas),
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

// Agrupa los cobros por una clave del pago (medio, cuenta o sucursal del
// pedido). Cada fila trae bruto, reembolsado y **neto** (#148 §18: «pagos
// netos por tipo»): los reembolsados no suman cobro, se informan aparte.
function pagosAgrupados(ordenes, claveDe, etiquetaDe) {
  const mapa = new Map()
  for (const orden of ordenes.filter(vivo)) {
    for (const pago of Array.isArray(orden?.payments) ? orden.payments : []) {
      const reembolsado = pago?.status === 'REFUNDED'
      if (!reembolsado && !(pago?.status === 'CONFIRMED' || pago?.status === undefined)) continue
      const clave = claveDe(pago, orden)
      const actual = mapa.get(clave) || { clave, etiqueta: etiquetaDe(pago, clave, orden), monto: 0, reembolsado: 0, neto: 0, pagos: 0 }
      const monto = Number(pago.amountPyg ?? pago.monto ?? 0)
      if (reembolsado) actual.reembolsado += monto
      else {
        actual.monto += monto
        actual.pagos += 1
      }
      actual.neto = actual.monto - actual.reembolsado
      mapa.set(clave, actual)
    }
  }
  return [...mapa.values()].sort((a, b) => b.neto - a.neto)
}

const pagosPorTipo = (ordenes) =>
  pagosAgrupados(ordenes, (pago) => pago.method || pago.medioPago || 'Otro', (pago) => paymentMethodLabel(pago.method || pago.medioPago) || 'Otro')

// Cobros por cuenta de cobro (con la cuenta congelada en el pago cuando existe).
const pagosPorCuenta = (ordenes) =>
  pagosAgrupados(
    ordenes,
    (pago) => pago.accountId || pago.accountSnapshot?.id || pago.accountSnapshot?.name || 'sin-cuenta',
    (pago) => pago.accountSnapshot?.name || pago.cuenta || 'Sin cuenta',
  )

// Cobros por sucursal del pedido (#148 §18: «pagos por cuenta y sucursal»).
const pagosPorSucursal = (ordenes) =>
  pagosAgrupados(
    ordenes,
    (pago, orden) => orden?.branch?.id || orden?.branchId || 'sin-sucursal',
    (pago, clave, orden) => orden?.branch?.name || clave,
  )

// Tablero del POS: hoy vs ayer + desgloses del día de hoy.
// `desde` acota los desgloses a un período (por defecto, solo hoy); el
// comparativo del encabezado sigue siendo hoy contra ayer.
export function tableroPos(ordenes, { hoy = fechaClave(), ayer, desde } = {}) {
  const delDia = (ordenes || []).filter((orden) => diaDe(orden?.createdAt || orden?.fecha || orden?.date) === hoy)
  const delPeriodo = desde && desde !== hoy
    ? (ordenes || []).filter((orden) => {
        const dia = diaDe(orden?.createdAt || orden?.fecha || orden?.date)
        return dia && dia >= desde && dia <= hoy
      })
    : delDia
  const diaAyer = ayer ?? (() => {
    const fecha = new Date(`${hoy}T12:00:00`)
    fecha.setDate(fecha.getDate() - 1)
    return fechaClave(fecha)
  })()
  const previas = (ordenes || []).filter((orden) => diaDe(orden?.createdAt || orden?.fecha || orden?.date) === diaAyer)
  return {
    hoy: resumenDelDia(delDia),
    ayer: resumenDelDia(previas),
    periodo: resumenDelDia(delPeriodo),
    desde: desde || hoy,
    topProductos: topProductos(delPeriodo),
    porVendedor: agrupar(delPeriodo, (orden) => orden?.seller?.id || orden?.sellerId, (orden, clave) => orden?.seller?.name || clave),
    porSucursal: agrupar(delPeriodo, (orden) => orden?.branch?.id || orden?.branchId, (orden, clave) => orden?.branch?.name || clave),
    pagos: pagosPorTipo(delPeriodo),
    pagosPorCuenta: pagosPorCuenta(delPeriodo),
    pagosPorSucursal: pagosPorSucursal(delPeriodo),
  }
}

export const comparacion = (actual, previo) => {
  const a = Number(actual) || 0
  const b = Number(previo) || 0
  if (!b) return a > 0 ? 100 : 0
  return Math.round(((a - b) / b) * 100)
}

export { vacio as resumenVacio }
