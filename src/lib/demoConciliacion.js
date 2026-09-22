import { paymentMethodLabel } from './constants.js'
import { leerDemo, guardarDemo } from './demoStorage.js'
import { getDemoTenant } from './demoTenant.js'

// Conciliación ficticia de la demo (#194): arma el mismo contrato que
// `GET /api/finance/reconciliation` a partir de los cobros de las ventas demo y
// las cuentas ficticias, y guarda los lotes conciliados en este navegador.
// La demo no consulta la API real: acá se simula el resultado y la acción.

const KEY = 'mobos:demo-conciliacion:v1'

// Medio legacy de las ventas demo → código del medio como lo usa el reporte.
// Las claves van en mayúsculas: el llamador normaliza el medio a mayúsculas.
const METODOS_DE_MEDIO = {
  DINERO: 'CASH',
  'DINERO USD': 'CASH',
  'UENO BANK': 'TRANSFER',
  TRANSFERENCIA: 'TRANSFER',
  'POS UENO': 'CARD',
  TARJETA: 'CARD',
  PIX: 'PIX',
  'PIK ITAÚ': 'PIX',
  'USDT - CRIPTO': 'CRYPTO',
  USDT: 'CRYPTO',
  CANJE: 'TRADE_IN',
  DINELCO: 'CARD',
  CONTINENTAL: 'TRANSFER',
  FAMILIAR: 'TRANSFER',
}
// Procesadora para los cobros con tarjeta que no traen una cuenta con procesadora.
const PROCESADORAS_DE_MEDIO = { 'POS UENO': 'UPay', TARJETA: 'UPay', DINELCO: 'Dinelco', 'PIK ITAÚ': 'Pix' }

/** Código del medio (CASH, TRANSFER…) a partir del medio legacy de la demo. */
export function metodoDeMedio(medioLegacy) {
  return METODOS_DE_MEDIO[String(medioLegacy || '').toUpperCase()] || 'CASH'
}

function leerEstado() {
  try {
    const guardado = JSON.parse(leerDemo(KEY))
    if (guardado && typeof guardado === 'object' && Array.isArray(guardado.lotes) && guardado.conciliados && typeof guardado.conciliados === 'object') {
      return { lotes: guardado.lotes, conciliados: guardado.conciliados }
    }
  } catch { /* almacenamiento no disponible o corrupto */ }
  // #213: un lote ya conciliado con diferencia (comisión bancaria ficticia).
  const hace = (dias) => new Date(Date.now() - dias * 86400000).toISOString()
  return {
    lotes: [{
      id: 'demo-lote-1', createdAt: hace(2), from: hace(2), to: hace(2),
      accountId: 'demo-transfer-itau', cuenta: 'Itaú · Cuenta corriente', procesadora: '',
      expectedPyg: 3600000, receivedPyg: 3550000, differencePyg: -50000,
      state: 'VERIFIED', estado: 'DIFFERENCE',
      note: 'Diferencia: comisión bancaria de la transferencia.', creadoPor: 'Hernán Acosta', pagos: 1,
    }],
    conciliados: {},
  }
}

function escribirEstado(estado) {
  try { guardarDemo(KEY, JSON.stringify(estado)) } catch { /* almacenamiento no disponible */ }
  return estado
}

export function getDemoConciliacion() {
  return leerEstado()
}

/** Simula la conciliación en lote: registra el lote y marca los pagos. */
export function conciliarDemoLote({ items = [], receivedPyg = 0, note = '' } = {}) {
  const estado = leerEstado()
  const seleccion = items.filter((item) => item?.id)
  if (!seleccion.length) throw new Error('Elegí al menos un pago para el lote.')
  // Misma regla que el endpoint real: un lote cubre una sola cuenta.
  const cuentas = new Set(seleccion.map((item) => item.accountId || ''))
  if (cuentas.size > 1) throw new Error('Los pagos del lote deben pertenecer a la misma cuenta.')
  const expectedPyg = seleccion.reduce((suma, item) => suma + (Number(item.montoPyg) || 0), 0)
  const recibido = Number(receivedPyg)
  const received = Number.isFinite(recibido) ? recibido : expectedPyg
  const differencePyg = received - expectedPyg
  const fechas = seleccion.map((item) => new Date(item.fecha)).filter((fecha) => !Number.isNaN(fecha.getTime())).sort((a, b) => a - b)
  const lote = {
    id: `demo-lote-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    from: fechas[0]?.toISOString() || null,
    to: fechas[fechas.length - 1]?.toISOString() || null,
    accountId: seleccion[0]?.accountId || null,
    cuenta: seleccion[0]?.cuenta || 'Sin cuenta',
    procesadora: seleccion[0]?.procesadora || '',
    expectedPyg,
    receivedPyg: received,
    differencePyg,
    state: 'VERIFIED',
    estado: differencePyg ? 'DIFFERENCE' : 'VERIFIED',
    note: String(note || ''),
    creadoPor: 'Hernán Acosta',
    pagos: seleccion.length,
  }
  const next = {
    lotes: [lote, ...estado.lotes],
    conciliados: { ...estado.conciliados, ...Object.fromEntries(seleccion.map((item) => [item.id, lote.id])) },
  }
  escribirEstado(next)
  return lote
}

function filaVacia(key, label, secondary, method, processor, currency) {
  return { key, label, secondary, method, processor, currency, count: 0, confirmedPyg: 0, pendingPyg: 0, refundedPyg: 0, verifiedPyg: 0, unverifiedPyg: 0, verifiedCount: 0, pendingCount: 0, differencePyg: 0 }
}

function ordenarFilas(filas) {
  return [...filas.values()].sort((a, b) => (b.confirmedPyg + b.pendingPyg) - (a.confirmedPyg + a.pendingPyg) || a.label.localeCompare(b.label))
}

// Clave de día local: el rango de la pantalla viene en fechas locales y una
// venta de las 23:00 no debe caer en el día UTC siguiente.
function claveDeDia(valor) {
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return ''
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
}

/**
 * Construye la respuesta de conciliación de la demo:
 * `{ resumen, porCuenta, porMedio, porProcesadora, items, lotes, truncado }`.
 */
export function construirDemoConciliacion({ ventas = [], cuentas = [], desde = '', hasta = '', accountId = '', method = '', processor = '' } = {}) {
  const estado = leerEstado()
  const enRango = (valor) => {
    const clave = claveDeDia(valor)
    if (!clave) return false
    return (!desde || clave >= desde) && (!hasta || clave <= hasta)
  }
  const cuentaPorNombre = new Map((cuentas || []).map((cuenta) => [String(cuenta?.name || '').toLowerCase(), cuenta]))
  const numeroDeVenta = new Map()
  const prefijo = getDemoTenant().orderPrefix || 'AUR'
  let siguiente = 1
  for (const venta of ventas) numeroDeVenta.set(venta.id, `${prefijo}-${String(siguiente++).padStart(4, '0')}`)

  const items = []
  for (const venta of ventas) {
    for (const pago of Array.isArray(venta.pagos) ? venta.pagos : []) {
      const fecha = pago.fecha || venta.creadoEn || venta.fecha
      if (!enRango(fecha)) continue
      const medioLegacy = String(pago.medioPago || '').toUpperCase()
      const metodo = metodoDeMedio(medioLegacy)
      const cuenta = cuentaPorNombre.get(String(pago.cuenta || '').toLowerCase()) || null
      const batchId = estado.conciliados[pago.id] || null
      const lote = batchId ? estado.lotes.find((fila) => fila.id === batchId) : null
      const item = {
        id: pago.id,
        fecha,
        method: metodo,
        metodo: paymentMethodLabel(metodo),
        status: 'CONFIRMED',
        orderId: venta.id,
        orderNumber: numeroDeVenta.get(venta.id) || 'DEMO',
        cliente: venta.cliente || '',
        vendedor: 'Hernán Acosta',
        accountId: cuenta?.id || null,
        cuenta: cuenta?.name || pago.cuenta || 'Efectivo',
        titular: cuenta?.holder || '',
        banco: cuenta?.bank || '',
        procesadora: cuenta?.processor || PROCESADORAS_DE_MEDIO[medioLegacy] || '',
        currency: cuenta?.currency || 'PYG',
        originalAmount: null,
        montoPyg: Number(pago.monto) || 0,
        reference: '',
        settlesAt: null,
        conciliacion: {
          state: lote ? 'VERIFIED' : 'PENDING',
          note: lote?.note || '',
          batchId: lote?.id || null,
          verificadoPor: lote?.creadoPor || '',
          verificadoAt: lote?.createdAt || null,
        },
      }
      items.push(item)
    }
  }

  const filtrados = items.filter((item) =>
    (!accountId || item.accountId === accountId) &&
    (!method || item.method === method) &&
    (!processor || item.procesadora === processor))

  const porCuenta = new Map()
  const porMedio = new Map()
  const porProcesadora = new Map()
  const resumen = { count: 0, confirmedPyg: 0, pendingPyg: 0, refundedPyg: 0, verifiedPyg: 0, unverifiedPyg: 0, verifiedCount: 0, pendingCount: 0, differencePyg: 0 }

  for (const item of filtrados) {
    const verificada = item.conciliacion.state === 'VERIFIED'
    const cuentaKey = item.accountId || `metodo:${item.method}`
    const cuentaFila = porCuenta.get(cuentaKey) || filaVacia(cuentaKey, item.cuenta, [item.titular, item.banco].filter(Boolean).join(' · '), item.method, item.procesadora, item.currency)
    const medioFila = porMedio.get(item.method) || filaVacia(item.method, item.metodo, '', item.method, '', null)
    const procesadoraKey = item.procesadora || 'sin-procesadora'
    const procesadoraFila = porProcesadora.get(procesadoraKey) || filaVacia(procesadoraKey, item.procesadora || 'Sin procesadora', '', item.method, item.procesadora, null)

    for (const fila of [cuentaFila, medioFila, procesadoraFila]) {
      fila.count += 1
      fila.confirmedPyg += item.montoPyg
      if (verificada) { fila.verifiedPyg += item.montoPyg; fila.verifiedCount += 1 } else { fila.unverifiedPyg += item.montoPyg; fila.pendingCount += 1 }
    }
    porCuenta.set(cuentaKey, cuentaFila)
    porMedio.set(item.method, medioFila)
    porProcesadora.set(procesadoraKey, procesadoraFila)

    resumen.count += 1
    resumen.confirmedPyg += item.montoPyg
    if (verificada) { resumen.verifiedPyg += item.montoPyg; resumen.verifiedCount += 1 } else { resumen.unverifiedPyg += item.montoPyg; resumen.pendingCount += 1 }
  }

  // Diferencias de los lotes: se reparten en la cuenta, el medio y la procesadora
  // del lote (los pagos de un lote comparten cuenta, como en producción).
  const lotes = estado.lotes.filter((lote) => enRango(lote.createdAt))
  for (const lote of lotes) {
    if (!lote.differencePyg || lote.state === 'REJECTED') continue
    resumen.differencePyg += lote.differencePyg
    const item = items.find((fila) => fila.accountId && fila.accountId === lote.accountId)
      || items.find((fila) => !lote.accountId && fila.cuenta === lote.cuenta)
    if (!item) continue
    const cuentaFila = porCuenta.get(item.accountId || `metodo:${item.method}`)
    if (cuentaFila) cuentaFila.differencePyg += lote.differencePyg
    const medioFila = porMedio.get(item.method)
    if (medioFila) medioFila.differencePyg += lote.differencePyg
    const procesadoraFila = porProcesadora.get(item.procesadora || 'sin-procesadora')
    if (procesadoraFila) procesadoraFila.differencePyg += lote.differencePyg
  }

  return {
    rango: { from: desde, to: hasta, branchId: 'mobos-demo-central' },
    resumen: { ...resumen, lotes: lotes.length, porConciliar: resumen.unverifiedPyg },
    porCuenta: ordenarFilas(porCuenta),
    porMedio: ordenarFilas(porMedio),
    porProcesadora: ordenarFilas(porProcesadora),
    items: filtrados,
    lotes,
    truncado: false,
  }
}
