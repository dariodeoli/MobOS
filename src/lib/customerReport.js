// Informe descargable del cliente (CSV): reúne datos, facturación, direcciones,
// pedidos, totales, compras mensuales, productos, cronología, deudas y
// garantías en un solo archivo, filtrado por período. Lógica pura para poder
// testearla sin navegador.

export const PERIODOS_INFORME = [
  { clave: 'todo', nombre: 'Todo' },
  { clave: 'anio', nombre: 'Este año' },
  { clave: '12m', nombre: 'Últimos 12 meses' },
  { clave: 'custom', nombre: 'Personalizado' },
]

// Rango [desde, hasta] inclusive en días locales. `null` = sin límite.
export function rangoPeriodo(clave, { desde = '', hasta = '', hoy = new Date() } = {}) {
  if (clave === 'custom') {
    const inicio = desde ? new Date(`${desde}T00:00:00`) : null
    const fin = hasta ? new Date(`${hasta}T23:59:59.999`) : null
    return { desde: inicio && !Number.isNaN(inicio.getTime()) ? inicio : null, hasta: fin && !Number.isNaN(fin.getTime()) ? fin : null }
  }
  if (clave === 'anio') {
    const inicio = new Date(hoy.getFullYear(), 0, 1)
    const fin = new Date(hoy.getFullYear(), 11, 31, 23, 59, 59, 999)
    return { desde: inicio, hasta: fin }
  }
  if (clave === '12m') {
    const fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59, 999)
    const inicio = new Date(fin)
    inicio.setMonth(inicio.getMonth() - 12)
    inicio.setHours(0, 0, 0, 0)
    return { desde: inicio, hasta: fin }
  }
  return { desde: null, hasta: null }
}

export function dentroDelRango(fecha, rango) {
  const valor = fecha ? new Date(fecha) : null
  if (!valor || Number.isNaN(valor.getTime())) return false
  if (rango?.desde && valor < rango.desde) return false
  if (rango?.hasta && valor > rango.hasta) return false
  return true
}

const fechaTexto = (valor) => {
  const fecha = valor ? new Date(valor) : null
  return fecha && !Number.isNaN(fecha.getTime()) ? fecha.toLocaleDateString('es-PY') : ''
}
const fechaHoraTexto = (valor) => {
  const fecha = valor ? new Date(valor) : null
  return fecha && !Number.isNaN(fecha.getTime()) ? fecha.toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short', hour12: false }) : ''
}
const nombreTipo = (pricingTier) => (pricingTier === 'WHOLESALE' ? 'Mayorista' : 'Cliente final')
const saldoOrden = (order) => Number(order?.pendingPyg ?? order?.balancePyg ?? 0)
const pagadoOrden = (order) => Number(order?.collectedPyg ?? order?.paidPyg ?? 0)
const tituloEvento = (event) => [event.action, event.detail].filter(Boolean).join(' · ')

// Devuelve las secciones del informe como [{ titulo, filas }] listas para CSV.
export function seccionesInforme({ customer = {}, orders = [], warranties = [], timeline = [], analytics = null, billingIdentities = [], rango = null } = {}) {
  const identidades = billingIdentities.length ? billingIdentities : (customer.billingName || customer.billingDocument ? [{ name: customer.billingName, document: customer.billingDocument, uses: '' }] : [])
  const pedidosPeriodo = orders.filter((order) => dentroDelRango(order.createdAt, rango))
  const totalPeriodo = pedidosPeriodo.reduce((suma, order) => suma + Number(order.totalPyg || 0), 0)
  const pagadoPeriodo = pedidosPeriodo.reduce((suma, order) => suma + pagadoOrden(order), 0)
  const saldoPeriodo = pedidosPeriodo.reduce((suma, order) => suma + saldoOrden(order), 0)
  const ticketPeriodo = pedidosPeriodo.length ? Math.round(totalPeriodo / pedidosPeriodo.length) : 0
  const meses = new Map()
  for (const order of pedidosPeriodo) {
    const fecha = new Date(order.createdAt)
    if (Number.isNaN(fecha.getTime())) continue
    const clave = fecha.toLocaleDateString('en-CA').slice(0, 7)
    const acumulado = meses.get(clave) || { mes: clave, compras: 0, total: 0 }
    acumulado.compras += 1
    acumulado.total += Number(order.totalPyg || 0)
    meses.set(clave, acumulado)
  }
  const deudas = orders.filter((order) => saldoOrden(order) > 0)
  const eventos = timeline.filter((event) => dentroDelRango(event.createdAt, rango))

  return [
    {
      titulo: 'Datos del cliente',
      filas: [
        ['Nombre', customer.name || ''],
        ['Documento', customer.document || ''],
        ['Tipo', nombreTipo(customer.pricingTier)],
        ['Teléfono', customer.telefonoVisible || customer.phone || ''],
        ['Correo', customer.email || ''],
        ['Ciudad', customer.ciudad || ''],
        ['Cliente desde', fechaHoraTexto(customer.createdAt)],
        ['Creado por', customer.createdByName || 'Sistema'],
      ],
    },
    {
      titulo: 'Datos de facturación',
      filas: [['Razón social', 'RUC', 'Uso'], ...identidades.map((item) => [item.name || '', item.document || '', item.uses === '' || item.uses === undefined ? '' : `${item.uses} ${Number(item.uses) === 1 ? 'pedido' : 'pedidos'}`])],
    },
    {
      titulo: 'Direcciones',
      filas: [['Etiqueta', 'Dirección', 'Ciudad', 'Departamento'], ...(customer.addresses || []).map((address) => [address.label || '', address.address || '', address.city || '', address.department || ''])],
    },
    {
      titulo: 'Comercial',
      filas: [
        ['Tipo', nombreTipo(customer.pricingTier)],
        ['Crédito', Number(customer.creditLimitPyg || 0) > 0 ? 'Sí' : 'No'],
        ['Días autorizados', customer.creditDays ?? ''],
        ['Límite (Gs)', Number(customer.creditLimitPyg || 0) > 0 ? Number(customer.creditLimitPyg) : ''],
      ],
    },
    {
      titulo: 'Resumen del período',
      filas: [
        ['Pedidos', pedidosPeriodo.length],
        ['Total gastado (Gs)', totalPeriodo],
        ['Pagado (Gs)', pagadoPeriodo],
        ['Saldo (Gs)', saldoPeriodo],
        ['Ticket promedio (Gs)', ticketPeriodo],
      ],
    },
    {
      titulo: 'Pedidos',
      filas: [['Pedido', 'Fecha', 'Estado', 'Total (Gs)', 'Pagado (Gs)', 'Saldo (Gs)'], ...pedidosPeriodo.map((order) => [order.orderNumber || '', fechaTexto(order.createdAt), order.status || '', Number(order.totalPyg || 0), pagadoOrden(order), saldoOrden(order)])],
    },
    {
      titulo: 'Compras mensuales',
      filas: [['Mes', 'Compras', 'Total (Gs)'], ...[...meses.values()].map((item) => [item.mes, item.compras, item.total])],
    },
    {
      titulo: 'Productos más comprados (histórico)',
      filas: [['Producto', 'Cantidad', 'Total (Gs)'], ...((analytics?.topProducts || []).map((item) => [item.description, item.quantity, item.totalPyg]))],
    },
    {
      titulo: 'Deudas por pedido',
      filas: [['Pedido', 'Fecha', 'Total (Gs)', 'Pagado (Gs)', 'Saldo (Gs)'], ...deudas.map((order) => [order.orderNumber || '', fechaTexto(order.createdAt), Number(order.totalPyg || 0), pagadoOrden(order), saldoOrden(order)])],
    },
    {
      titulo: 'Garantías',
      filas: [['Serial', 'Equipo', 'Estado', 'Registrada', 'Vence'], ...warranties.map((item) => [item.serial || '', item.description || '', item.status || '', fechaTexto(item.createdAt), fechaTexto(item.expiresAt)])],
    },
    {
      titulo: 'Cronología del período',
      filas: [['Fecha', 'Evento', 'Usuario'], ...eventos.map((event) => [fechaHoraTexto(event.createdAt), tituloEvento(event), event.user?.name || 'Sistema'])],
    },
  ]
}

const celdaCsv = (valor) => `"${String(valor ?? '').replace(/"/g, '""')}"`

export function informeCsv(secciones) {
  const lineas = []
  for (const seccion of secciones) {
    lineas.push(celdaCsv(seccion.titulo))
    for (const fila of seccion.filas) lineas.push(fila.map(celdaCsv).join(';'))
    lineas.push('')
  }
  return lineas.join('\n')
}

export function nombreArchivoInforme(nombre, clave = 'todo') {
  const limpio = String(nombre || 'cliente').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'cliente'
  return `cliente-${limpio}-${clave}.csv`
}
