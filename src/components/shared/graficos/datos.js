// Cálculos puros del kit de gráficos (sin React): ventanas de días, series
// continuas, escalas y geometría. Todo sale de los datos que la pantalla ya
// tiene; nada se inventa ni se rellena con números de relleno (un día sin
// ventas vale 0 porque realmente no se vendió).
import { cobradoDeVenta, fechaClave, num } from '../../../utils/calculos.js'

const aFecha = (clave) => new Date(`${clave}T12:00:00`)

export function sumarDias(clave, dias) {
  const fecha = aFecha(clave)
  fecha.setDate(fecha.getDate() + dias)
  return fechaClave(fecha)
}

/** Últimos `n` días que terminan en `hasta` (inclusive) y los `n` anteriores. */
export function ventanaDias(hasta, n) {
  const dias = Math.max(1, Math.floor(n))
  const desde = sumarDias(hasta, -(dias - 1))
  return {
    actual: { desde, hasta },
    anterior: { desde: sumarDias(desde, -dias), hasta: sumarDias(desde, -1) },
  }
}

/** Todas las fechas del rango, de a un día. */
export function fechasDeRango(desde, hasta) {
  const lista = []
  if (!desde || !hasta || desde > hasta) return lista
  for (let f = desde, guard = 0; f <= hasta && guard < 800; f = sumarDias(f, 1), guard += 1) lista.push(f)
  return lista
}

/** Serie continua [{ fecha, valor }]: los días sin movimiento valen 0. */
export function serieContinua(rango, porFecha = {}) {
  return fechasDeRango(rango.desde, rango.hasta).map((fecha) => ({ fecha, valor: num(porFecha[fecha]) }))
}

/** Acumula `leer(item)` por la fecha de cada item. */
export function sumarPorFecha(items = [], leer, rango) {
  const mapa = {}
  for (const item of items) {
    const fecha = item.fecha
    if (!fecha || (rango && (fecha < rango.desde || fecha > rango.hasta))) continue
    mapa[fecha] = (mapa[fecha] || 0) + num(leer(item))
  }
  return mapa
}

/** Unidades de una venta: suma de cantidades de sus líneas o 1 si es legacy. */
export function unidadesDeVenta(venta) {
  const items = Array.isArray(venta?.items) ? venta.items : []
  if (!items.length) return 1
  return items.reduce((suma, item) => suma + Math.max(1, num(item.quantity || 1)), 0)
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "14 oct" para ejes y tooltips. */
export function etiquetaFecha(clave) {
  const [, mes, dia] = String(clave).split('-')
  return `${Number(dia)} ${MESES[Number(mes) - 1] || ''}`.trim()
}

/** Valor abreviado solo para marcas del eje; los importes reales van completos. */
export function abreviar(valor) {
  const v = num(valor)
  const abs = Math.abs(v)
  const fmt = (n) => String(Math.round(n * 10) / 10).replace('.', ',')
  if (abs >= 1e9) return `${fmt(v / 1e9)} mil M`
  if (abs >= 1e6) return `${fmt(v / 1e6)} M`
  if (abs >= 1e3) return `${fmt(v / 1e3)} mil`
  return String(Math.round(v))
}

/** Marcas "lindas" (1/2/5 × 10^k) desde 0 hasta >= max. */
export function escalaLinda(max, marcas = 4) {
  const tope = Math.max(num(max), 1)
  const bruto = tope / marcas
  const potencia = 10 ** Math.floor(Math.log10(bruto))
  const base = [1, 2, 5, 10].find((m) => m * potencia >= bruto) * potencia
  const ticks = []
  for (let v = 0; v < tope + base; v += base) {
    ticks.push(v)
    if (v >= tope) break
  }
  return { ticks, max: ticks[ticks.length - 1] || base }
}

/** Nombre legible de un medio de pago guardado en las ventas. */
export function nombreMedio(medio) {
  const crudo = String(medio ?? '').trim()
  if (!crudo || crudo === '—') return 'Sin medio'
  const m = crudo.toLowerCase()
  if (m.includes('dinero') || m.includes('efectivo')) return 'Efectivo'
  if (m.includes('transfer')) return 'Transferencia'
  if (m.includes('upay') || m.includes('pos ueno')) return 'POS Ueno'
  if (m.includes('ueno')) return 'Ueno Bank'
  if (m.includes('pik')) return 'Pik Itaú'
  if (m.includes('dinelco')) return 'Dinelco'
  if (m.includes('continental')) return 'Continental'
  if (m.includes('familiar')) return 'Banco Familiar'
  return crudo.charAt(0) + crudo.slice(1).toLowerCase()
}

/** Puntos [x,y] → "M x y L x y …" (línea). */
export function rutaLinea(puntos) {
  return puntos.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
}

/** Área cerrada contra la línea base `yBase`. */
export function rutaArea(puntos, yBase) {
  if (!puntos.length) return ''
  const ultimo = puntos[puntos.length - 1]
  return `${rutaLinea(puntos)} L${ultimo[0].toFixed(1)} ${yBase.toFixed(1)} L${puntos[0][0].toFixed(1)} ${yBase.toFixed(1)} Z`
}

/** Sector de dona (ángulos en radianes desde las 12 en punto). */
export function rutaSector(cx, cy, rExterno, rInterno, a0, a1) {
  const llegaAlCirculo = a1 - a0 >= Math.PI * 2 - 1e-6
  const fin = llegaAlCirculo ? a0 + Math.PI * 2 - 1e-4 : a1
  const p = (r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)]
  const [x0, y0] = p(rExterno, a0)
  const [x1, y1] = p(rExterno, fin)
  const [x2, y2] = p(rInterno, fin)
  const [x3, y3] = p(rInterno, a0)
  const grande = fin - a0 > Math.PI ? 1 : 0
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${rExterno} ${rExterno} 0 ${grande} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)} A${rInterno} ${rInterno} 0 ${grande} 0 ${x3.toFixed(2)} ${y3.toFixed(2)} Z`
}

/** Variación porcentual; null si no hay base para comparar (sin inventar). */
export function variacionPct(actual, anterior) {
  const base = num(anterior)
  return base > 0 ? ((num(actual) - base) / base) * 100 : null
}

/**
 * Tendencia diaria de una ventana con los datos locales: ventas, cobrado,
 * pedidos, unidades, ticket y ganancia (ventas − costo − gastos del día, la
 * misma regla del resumen). Cada serie es continua: un día sin ventas vale 0.
 */
export function tendenciaDiaria({ ventas = [], gastos = [], prods = {} }, rango) {
  const dentro = (v) => v.fecha >= rango.desde && v.fecha <= rango.hasta
  const act = (Array.isArray(ventas) ? ventas : []).filter(dentro)
  const gast = (Array.isArray(gastos) ? gastos : []).filter(dentro)
  const total = sumarPorFecha(act, (v) => v.precio)
  const cobrado = sumarPorFecha(act, cobradoDeVenta)
  const pedidos = sumarPorFecha(act, () => 1)
  const unidades = sumarPorFecha(act, unidadesDeVenta)
  const costo = sumarPorFecha(act, (v) => v.precioCosto ?? prods[v.productoId]?.precioCosto)
  const gasto = sumarPorFecha(gast, (g) => g.monto)
  const fechas = fechasDeRango(rango.desde, rango.hasta)
  const por = (mapa) => fechas.map((fecha) => ({ fecha, valor: num(mapa[fecha]) }))
  return {
    total: por(total),
    cobrado: por(cobrado),
    pedidos: por(pedidos),
    unidades: por(unidades),
    ticket: fechas.map((fecha) => ({ fecha, valor: pedidos[fecha] ? Math.round(num(total[fecha]) / pedidos[fecha]) : 0 })),
    pendiente: fechas.map((fecha) => ({ fecha, valor: Math.max(0, num(total[fecha]) - num(cobrado[fecha])) })),
    ganancia: fechas.map((fecha) => ({ fecha, valor: num(total[fecha]) - num(costo[fecha]) - num(gasto[fecha]) })),
  }
}

/** Solo los valores de una serie continua (para sparklines). */
export const valoresDe = (serie) => serie.map((p) => p.valor)
