// Agregados de un cliente calculados desde sus pedidos, con las MISMAS
// fórmulas que la cuenta real (backend `customers/[id]/analytics` y el listado
// de clientes). Se usa en el modo demo (#221) para que la lista y el perfil
// muestren totales, ticket promedio, promedio mensual y favoritos calculados
// de verdad, sin API. Puro y testeable.

const CANCELADOS = new Set(['CANCELLED'])
const TZ = 'America/Asuncion'

const etiquetaMes = (mes) => {
  const [anio, numero] = mes.split('-').map(Number)
  if (!anio || !numero) return mes
  return new Date(Date.UTC(anio, numero - 1, 1)).toLocaleDateString('es-PY', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}
const diaSemana = (fecha) => fecha.toLocaleDateString('es-PY', { weekday: 'long', timeZone: TZ })
const capitalizar = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1)
const totalDe = (order) => Number(order?.totalPyg || 0)

// Deuda de un pedido: el pendiente guardado o, si falta, total − cobrado.
const pendienteDe = (order) => {
  const guardado = order?.pendingPyg
  const calculado = totalDe(order) - Number(order?.collectedPyg ?? order?.paidPyg ?? 0)
  const valor = guardado === undefined || guardado === null ? calculado : Number(guardado)
  return Number.isFinite(valor) && valor > 0 ? valor : 0
}

/** Estadísticas del listado: mismos campos que devuelve el API de clientes. */
export function statsDePedidos(orders = []) {
  const validos = (Array.isArray(orders) ? orders : []).filter((order) => !CANCELADOS.has(String(order?.status || '')))
  const totalSpentPyg = validos.reduce((suma, order) => suma + totalDe(order), 0)
  const pendingPyg = validos.reduce((suma, order) => suma + pendienteDe(order), 0)
  const lastOrderAt = validos.reduce((max, order) => (order?.createdAt && (!max || order.createdAt > max) ? order.createdAt : max), null)
  return { orders: validos.length, totalSpentPyg, lastOrderAt, pendingPyg }
}

/** Analítica de la ficha: mismos campos y fórmulas que el API real. */
export function analiticaDePedidos(orders = [], { customerSince = null, ahora = new Date() } = {}) {
  const validos = (Array.isArray(orders) ? orders : [])
    .filter((order) => !CANCELADOS.has(String(order?.status || '')))
    .slice()
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  const porMes = new Map()
  const porProducto = new Map()
  const porModelo = new Map()
  const porCategoria = new Map()
  const porDia = new Map()
  let totalPyg = 0
  let sumaIntervalos = 0
  let intervalos = 0
  let anterior = null
  for (const order of validos) {
    const fecha = order?.createdAt ? new Date(order.createdAt) : null
    if (!fecha || Number.isNaN(fecha.getTime())) continue
    const total = totalDe(order)
    totalPyg += total
    if (anterior) { sumaIntervalos += Math.max(0, (fecha.getTime() - anterior.getTime()) / 86400000); intervalos += 1 }
    anterior = fecha
    const mes = fecha.toLocaleDateString('en-CA', { timeZone: TZ }).slice(0, 7)
    const acumuladoMes = porMes.get(mes) || { month: mes, label: etiquetaMes(mes), count: 0, totalPyg: 0 }
    acumuladoMes.count += 1; acumuladoMes.totalPyg += total
    porMes.set(mes, acumuladoMes)
    const dia = capitalizar(diaSemana(fecha))
    const acumuladoDia = porDia.get(dia) || { day: dia, count: 0, totalPyg: 0 }
    acumuladoDia.count += 1; acumuladoDia.totalPyg += total
    porDia.set(dia, acumuladoDia)
    for (const item of (Array.isArray(order.items) ? order.items : [])) {
      const cantidad = Number(item.quantity || 0)
      const lineaTotal = Number(item.totalPyg || 0)
      const clave = String(item.description || '').trim().slice(0, 120)
      if (clave) {
        const acumulado = porProducto.get(clave) || { description: clave, quantity: 0, totalPyg: 0 }
        acumulado.quantity += cantidad; acumulado.totalPyg += lineaTotal
        porProducto.set(clave, acumulado)
      }
      const modelo = String(item.model || item.product?.model || '').trim()
      if (modelo) {
        const acumulado = porModelo.get(modelo) || { model: modelo, quantity: 0, totalPyg: 0 }
        acumulado.quantity += cantidad; acumulado.totalPyg += lineaTotal
        porModelo.set(modelo, acumulado)
      }
      const categoria = String(item.category || item.product?.category || '').trim()
      if (categoria) {
        const acumulado = porCategoria.get(categoria) || { category: categoria, quantity: 0, totalPyg: 0 }
        acumulado.quantity += cantidad; acumulado.totalPyg += lineaTotal
        porCategoria.set(categoria, acumulado)
      }
    }
  }
  const count = validos.length
  const primera = validos[0]?.createdAt || null
  const ultima = validos[count - 1]?.createdAt || null
  const diasComprando = primera && ultima ? Math.max(1, Math.round((new Date(ultima).getTime() - new Date(primera).getTime()) / 86400000)) : 0
  const mesesActivos = primera ? Math.max(1, (ahora.getTime() - new Date(primera).getTime()) / (30 * 86400000)) : 1
  const desde = customerSince ? new Date(customerSince) : null
  const antiguedadDias = desde && !Number.isNaN(desde.getTime()) ? Math.max(0, Math.round((ahora.getTime() - desde.getTime()) / 86400000)) : 0
  return {
    ordersCount: count,
    totalPyg,
    avgTicketPyg: count ? Math.round(totalPyg / count) : 0,
    firstPurchaseAt: primera,
    lastPurchaseAt: ultima,
    purchasesPerMonth: diasComprando ? Number((count / (diasComprando / 30)).toFixed(2)) : 0,
    spendPerMonthPyg: Math.round(totalPyg / mesesActivos),
    frequencyDays: intervalos ? Math.round(sumaIntervalos / intervalos) : null,
    customerSince: desde,
    antiguedadDias,
    byMonth: [...porMes.values()].slice(-12),
    topProducts: [...porProducto.values()].sort((a, b) => b.totalPyg - a.totalPyg).slice(0, 8),
    topModels: [...porModelo.values()].sort((a, b) => b.totalPyg - a.totalPyg).slice(0, 5),
    topCategories: [...porCategoria.values()].sort((a, b) => b.totalPyg - a.totalPyg).slice(0, 5),
    topMonths: [...porMes.values()].sort((a, b) => b.totalPyg - a.totalPyg).slice(0, 3),
    topWeekdays: [...porDia.values()].sort((a, b) => b.count - a.count || b.totalPyg - a.totalPyg).slice(0, 3),
    statement: validos.slice().reverse().map((order) => ({ orderNumber: order.orderNumber, createdAt: order.createdAt, totalPyg: totalDe(order), status: order.status })),
  }
}
