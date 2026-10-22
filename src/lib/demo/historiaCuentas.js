// Libros de cuentas de la demo: movimientos día por día de las últimas ~17
// semanas en la caja, los bancos, las tarjetas y las billeteras, derivados de
// las MISMAS ventas, gastos, publicidad y compras que ve el resto de la app.
// Nada se inventa suelto: cada cobro es un pago de un pedido; cada depósito de
// caja tiene su ingreso en el banco; cada acreditación de tarjeta descuenta la
// comisión; cada saldo es la suma corrida de sus movimientos (cierran).
// Valores en guaraníes (las cuentas en dólares, reales o USDT se muestran por su
// equivalente en Gs). Puro y sin storage: recibe los datos y el «ahora».
import { diaDemo, instanteDemo } from './reloj.js'
import { formatGs } from '../../utils/moneda.js'

export const DIAS_LIBRO = 120
export const FONDO_CAJA = 500000
const MIN = 60000
const DIA = 86400000

export const CUENTAS_LIBRO = [
  { id: 'demo-cash-pyg', name: 'Caja · Guaraníes', kind: 'CASH', grupo: 'Caja' },
  { id: 'demo-cash-usd', name: 'Caja · Dólares', kind: 'CASH', grupo: 'Caja' },
  { id: 'demo-transfer-itau', name: 'Itaú · Cuenta corriente', kind: 'TRANSFER', grupo: 'Banco' },
  { id: 'demo-transfer-continental', name: 'Continental · Cuenta corriente', kind: 'TRANSFER', grupo: 'Banco' },
  { id: 'demo-transfer-ueno-ahorro', name: 'Ueno · Caja de ahorro', kind: 'TRANSFER', grupo: 'Banco' },
  { id: 'demo-transfer-gnb-owner', name: 'GNB · Cuenta del dueño', kind: 'TRANSFER', grupo: 'Banco' },
  { id: 'demo-card-ueno', name: 'Ueno · Tarjeta', kind: 'CARD', grupo: 'Tarjeta' },
  { id: 'demo-card-dinelco', name: 'Dinelco · Tarjeta', kind: 'CARD', grupo: 'Tarjeta' },
  { id: 'demo-pix', name: 'Pix · Itaú', kind: 'PIX', grupo: 'Billetera' },
  { id: 'demo-crypto', name: 'USDT · Binance', kind: 'CRYPTO', grupo: 'Billetera' },
  { id: 'demo-trade-in', name: 'Canje · Equipos', kind: 'TRADE_IN', grupo: 'Canje' },
]
const ID = Object.fromEntries(CUENTAS_LIBRO.map((c) => [c.name, c.id]))
const TARJETAS = {
  'demo-card-ueno': { dias: 2, fee: 0.03, banco: 'demo-transfer-itau', etiqueta: 'Ueno' },
  'demo-card-dinelco': { dias: 1, fee: 0.03, banco: 'demo-transfer-continental', etiqueta: 'Dinelco' },
}
const BILLETERAS = {
  'demo-pix': { fee: 0.015, etiqueta: 'Pix', destino: 'demo-transfer-itau' },
  'demo-crypto': { fee: 0.01, etiqueta: 'USDT', destino: 'demo-transfer-itau' },
}

const hash = (texto) => String(texto || '').split('').reduce((suma, c) => (suma * 31 + c.charCodeAt(0)) >>> 0, 7)
const aMs = (valor) => { const t = new Date(valor).getTime(); return Number.isFinite(t) ? t : null }

/** Cuenta (id) que recibe un pago de una venta, o null si no mueve plata (saldo a favor, gift card, crédito). */
export function cuentaDePago(pago = {}) {
  const medio = String(pago.medioPago || pago.method || '').toUpperCase()
  const cuenta = String(pago.cuenta || '')
  if (medio === 'DINERO' || medio === 'CASH' || medio === 'EFECTIVO') return 'demo-cash-pyg'
  if (medio === 'DINERO USD') return 'demo-cash-usd'
  if (medio === 'POS UENO') return 'demo-card-ueno'
  if (medio === 'TARJETA' || medio === 'CARD') return /Dinelco/i.test(cuenta) ? 'demo-card-dinelco' : 'demo-card-ueno'
  if (medio === 'PIX') return 'demo-pix'
  if (medio === 'USDT - CRIPTO' || medio === 'USDT') return 'demo-crypto'
  if (medio === 'CANJE') return 'demo-trade-in'
  if (medio === 'QR') return 'demo-transfer-continental'
  if (medio === 'TRANSFERENCIA' || medio === 'UENO BANK' || medio === 'TRANSFER') return ID[cuenta] && ID[cuenta].startsWith('demo-transfer') ? ID[cuenta] : 'demo-transfer-itau'
  return null
}

// ── Períodos de los filtros (Hoy, Ayer, 7 días, Mes, Mes anterior) ────
export const PERIODOS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'ayer', label: 'Ayer' },
  { id: '7d', label: '7 días' },
  { id: 'mes', label: 'Mes' },
  { id: 'mesAnterior', label: 'Mes anterior' },
]
const inicioDelDia = (dias, ahora) => aMs(instanteDemo(dias, 0, 0, ahora)) ?? 0
/** Rango [desde, hasta) en ms de un período, en el calendario de Paraguay. */
export function rangoPeriodo(periodo, ahora = new Date()) {
  const inicio = (dias) => inicioDelDia(dias, ahora)
  const hoy = diaDemo(0, ahora)
  const primeroDeEsteMes = Number(hoy.slice(8, 10)) - 1
  const diasMesAnterior = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1, 0)).getUTCDate()
  if (periodo === 'hoy') return [inicio(0), ahora.getTime() + 1]
  if (periodo === 'ayer') return [inicio(1), inicio(0)]
  if (periodo === '7d') return [inicio(6), ahora.getTime() + 1]
  if (periodo === 'mes') return [inicio(primeroDeEsteMes), ahora.getTime() + 1]
  return [inicio(primeroDeEsteMes + diasMesAnterior), inicio(primeroDeEsteMes)]
}
export const enPeriodo = (movimiento, periodo, ahora = new Date()) => {
  const [desde, hasta] = rangoPeriodo(periodo, ahora)
  const t = new Date(movimiento.at).getTime()
  return t >= desde && t < hasta
}

const FORMATO_DIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit' })
const claveDia = (t) => FORMATO_DIA.format(new Date(t))
const FORMATO_SEMANA = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Asuncion', weekday: 'short' })

// Movimientos chicos del cajón (sin azar: salen del día).
const EGRESOS_CHICOS = [
  ['Pago de flete / moto', 35000], ['Compra de insumos de limpieza', 48000], ['Agua mineral y café del local', 27000], ['Fotocopias y librería', 22000],
  ['Pasaje de cadete', 30000], ['Propina a repartidor', 20000],
]

/**
 * Libros del período. `ventas` = pedidos en la forma legacy (`pagos[].fecha`).
 * Devuelve cuentas (con saldo corrido), sesiones de caja diarias y transferencias internas.
 */
export function construirLibrosDemo({ ventas = [], gastos = [], ads = [], compras = [], ahora = new Date(), dias = DIAS_LIBRO } = {}) {
  const tope = ahora.getTime()
  const eventos = [] // { t, cuentaId, tipo, concepto, detalle, ingresoPyg, egresoPyg, user, ref, orden }
  const transferencias = []
  let secuencia = 0
  const nuevo = (e) => { secuencia += 1; eventos.push({ ingresoPyg: 0, egresoPyg: 0, detalle: '', user: 'Sistema', ref: '', ...e, orden: secuencia }) }
  const inicioVentana = aMs(instanteDemo(dias - 1, 0, 0, ahora)) ?? 0
  const en = (diasAtras, hora, minuto = 0) => aMs(instanteDemo(diasAtras, hora, minuto, ahora)) ?? tope
  const antes = (t) => Math.min(t, tope)
  const transferir = (t, desde, hasta, montoPyg, concepto, detalle = '', user = 'Hernán Acosta') => {
    if (!(montoPyg > 0) || t > tope) return
    const id = `demo-transf-${transferencias.length + 1}`
    transferencias.push({ id, t, desdeId: desde, hastaId: hasta, montoPyg })
    nuevo({ t, cuentaId: desde, tipo: 'TRANSFERENCIA_SALIDA', concepto, detalle, egresoPyg: montoPyg, user, ref: id })
    nuevo({ t, cuentaId: hasta, tipo: 'TRANSFERENCIA_ENTRADA', concepto, detalle, ingresoPyg: montoPyg, user, ref: id })
  }

  // 1. Cobros de los pedidos (todos los medios, señas y cuotas).
  const cobrosDia = new Map() // clave de día → { efectivo, pagos, pedidos:Set, ventasPyg }
  for (const venta of ventas) {
    if (venta.status === 'CANCELLED' || venta.anulada) continue
    const creado = aMs(venta.creadoEn || venta.createdAt) ?? tope
    const numero = venta.orderNumber || venta.numero || venta.id
    const vendedor = venta.seller?.name || 'Equipo demo'
    for (const pago of venta.pagos || []) {
      const monto = Number(pago.monto ?? pago.amountPyg) || 0
      const t = aMs(pago.fecha || pago.paidAt) ?? creado
      const cuentaId = cuentaDePago(pago)
      if (!(monto > 0) || !cuentaId || t < inicioVentana || t > tope) continue
      const tardio = t - creado > 6 * 3600000
      const concepto = tardio ? 'Cobro de cuota / saldo' : (monto < (Number(venta.totalPyg) || Infinity) && venta.pagos.length === 1 ? 'Seña de pedido' : 'Cobro de pedido')
      const base = { t, cuentaId, tipo: tardio ? 'COBRO_CUOTA' : 'COBRO', concepto, detalle: `${numero} · ${venta.cliente || venta.customer?.name || 'Cliente'}`, ingresoPyg: monto, user: tardio ? 'María Benítez' : vendedor, ref: numero }
      nuevo(base)
      if (cuentaId === 'demo-cash-pyg') {
        const clave = claveDia(t)
        const fila = cobrosDia.get(clave) || { efectivo: 0, pagos: 0, pedidos: new Set(), ventasPyg: 0 }
        fila.efectivo += monto; fila.pagos += 1; fila.pedidos.add(venta.id); fila.ventasPyg += Number(venta.precio ?? venta.subtotalPyg) || 0
        cobrosDia.set(clave, fila)
      }
      const tarjeta = TARJETAS[cuentaId]
      if (tarjeta) {
        // Acreditación a las 09:00 del día hábil de liquidación, con la comisión del procesador.
        const dia0 = Date.parse(`${claveDia(t)}T12:00:00Z`)
        const liquida = dia0 + tarjeta.dias * DIA
        const diasHasta = Math.round((Date.parse(`${diaDemo(0, ahora)}T12:00:00Z`) - liquida) / DIA)
        const tl = en(diasHasta, 9, 0)
        if (tl <= tope && diasHasta >= 0) {
          const comision = Math.round(monto * tarjeta.fee)
          nuevo({ t: tl, cuentaId, tipo: 'COMISION', concepto: `Comisión ${tarjeta.etiqueta} (${tarjeta.fee * 100}%)`, detalle: `${numero}`, egresoPyg: comision, ref: numero })
          transferir(tl, cuentaId, tarjeta.banco, monto - comision, `Acreditación de ${tarjeta.etiqueta}`, `Liquidación del ${claveDia(t)} · ${numero}`, 'Sistema')
        }
      }
      if (cuentaId === 'demo-trade-in') nuevo({ t: Math.min(tope, t + 3 * DIA), cuentaId, tipo: 'CANJE_SALIDA', concepto: 'Equipo de canje pasó al stock', detalle: numero, egresoPyg: monto, ref: numero })
    }
  }

  // 2. Gastos, publicidad y compras (se pagan con caja chica o por banco).
  for (const gasto of gastos) {
    const t = aMs(gasto.creadoEn) ?? 0
    const monto = Number(gasto.amountPyg ?? gasto.monto) || 0
    if (t < inicioVentana || t > tope || !(monto > 0) || gasto.status === 'VOID' || gasto.status === 'PENDING') continue
    const concepto = gasto.description || gasto.motivo || 'Gasto'
    if (gasto.kind === 'OWNER_WITHDRAWAL') { transferir(t, 'demo-transfer-itau', 'demo-transfer-gnb-owner', monto, 'Retiro del dueño', concepto); continue }
    if (gasto.kind === 'EXPENSE' && monto <= 300000) { nuevo({ t, cuentaId: 'demo-cash-pyg', tipo: 'GASTO', concepto, detalle: gasto.counterparty || '', egresoPyg: monto, user: 'Hernán Acosta', ref: gasto.id }); continue }
    nuevo({ t, cuentaId: hash(gasto.id) % 2 ? 'demo-transfer-continental' : 'demo-transfer-itau', tipo: gasto.kind === 'CHEQUE' ? 'CHEQUE' : gasto.kind === 'SUPPLIER_ADVANCE' ? 'ADELANTO' : 'GASTO', concepto, detalle: gasto.counterparty || '', egresoPyg: monto, user: 'Hernán Acosta', ref: gasto.id })
  }
  for (const ad of ads) {
    const t = aMs(ad.creadoEn) ?? 0
    if (t < inicioVentana || t > tope) continue
    nuevo({ t, cuentaId: 'demo-transfer-itau', tipo: 'PUBLICIDAD', concepto: `Publicidad · ${ad.plataforma}`, detalle: ad.nota || '', egresoPyg: Number(ad.monto) || 0, user: 'Hernán Acosta', ref: ad.id })
  }
  for (const compra of compras) {
    const pagos = compra.payments?.length ? compra.payments : (Number(compra.paidPyg) > 0 ? [{ id: `${compra.id}-pago`, amountPyg: compra.paidPyg, paidAt: compra.receivedAt || compra.createdAt, reference: 'Pago contra entrega' }] : [])
    for (const pago of pagos) {
      const t = aMs(pago.paidAt) ?? 0
      if (t < inicioVentana || t > tope) continue
      nuevo({ t, cuentaId: 'demo-transfer-itau', tipo: 'PROVEEDOR', concepto: `Pago a proveedor · ${compra.supplierName}`, detalle: `${compra.supplierReference || compra.id} · ${pago.reference || ''}`.trim(), egresoPyg: Number(pago.amountPyg) || 0, user: 'Hernán Acosta', ref: compra.id })
    }
  }

  // 3. Movimientos entre cuentas programados (dueño, dólares, bancos, billeteras).
  const programados = [
    // [días atrás, desde, hasta, monto, concepto]
    [0, 'demo-transfer-gnb-owner', 'demo-transfer-itau', 2400000, 'Aporte del dueño para compra de mercadería'],
    [1, 'demo-transfer-itau', 'demo-transfer-gnb-owner', 1100000, 'Adelanto de utilidades al dueño'],
    [2, 'demo-transfer-itau', 'demo-transfer-continental', 1500000, 'Transferencia entre cuentas propias'],
    [6, 'demo-transfer-itau', 'demo-transfer-gnb-owner', 3200000, 'Retiro del dueño'],
    [12, 'demo-transfer-continental', 'demo-transfer-ueno-ahorro', 2000000, 'Ahorro: reserva para impuestos'],
    [19, 'demo-transfer-gnb-owner', 'demo-transfer-itau', 4800000, 'Aporte del dueño para compra de mercadería'],
    [27, 'demo-transfer-ueno-ahorro', 'demo-transfer-itau', 1200000, 'Retorno de reserva a cuenta operativa'],
    [34, 'demo-transfer-itau', 'demo-transfer-gnb-owner', 3600000, 'Retiro del dueño'],
    [41, 'demo-transfer-itau', 'demo-transfer-continental', 2200000, 'Transferencia entre cuentas propias'],
    [49, 'demo-transfer-gnb-owner', 'demo-transfer-itau', 5200000, 'Aporte del dueño para compra de mercadería'],
    [58, 'demo-transfer-continental', 'demo-transfer-ueno-ahorro', 1800000, 'Ahorro: reserva para impuestos'],
    [66, 'demo-transfer-itau', 'demo-transfer-gnb-owner', 3000000, 'Retiro del dueño'],
    [75, 'demo-transfer-gnb-owner', 'demo-transfer-itau', 4400000, 'Aporte del dueño para compra de mercadería'],
    [88, 'demo-transfer-itau', 'demo-transfer-continental', 2600000, 'Transferencia entre cuentas propias'],
    [101, 'demo-transfer-gnb-owner', 'demo-transfer-itau', 3900000, 'Aporte del dueño para compra de mercadería'],
    [112, 'demo-transfer-ueno-ahorro', 'demo-transfer-continental', 900000, 'Retorno de reserva a cuenta operativa'],
  ]
  programados.forEach(([d, desde, hasta, monto, concepto], i) => { if (d < dias) transferir(en(d, 11, 20 + (i % 30)), desde, hasta, monto, concepto, 'Transferencia programada') })

  // Barridos semanales de las billeteras (lunes 09:00) y de los dólares en efectivo (martes 10:00).
  const ordenarCuenta = (id) => eventos.filter((e) => e.cuentaId === id).sort((a, b) => a.t - b.t || a.orden - b.orden)
  const saldoHasta = (id, t) => eventos.filter((e) => e.cuentaId === id && (e.t < t || (e.t === t))).reduce((suma, e) => suma + e.ingresoPyg - e.egresoPyg, 0)
  for (let d = dias - 1; d >= 0; d -= 1) {
    const clave = diaDemo(d, ahora)
    const dow = FORMATO_SEMANA.format(new Date(`${clave}T12:00:00Z`))
    if (dow === 'Mon') {
      const t = en(d, 9, 0)
      if (t > tope) continue
      for (const [id, cfg] of Object.entries(BILLETERAS)) {
        const saldo = saldoHasta(id, t)
        if (saldo <= 0) continue
        const comision = Math.round(saldo * cfg.fee)
        nuevo({ t, cuentaId: id, tipo: 'COMISION', concepto: `Comisión de cambio ${cfg.etiqueta} (${cfg.fee * 100}%)`, egresoPyg: comision })
        transferir(t, id, cfg.destino, saldo - comision, `${cfg.etiqueta}: conversión a guaraníes y envío a Itaú`, 'Barrido semanal', 'Hernán Acosta')
      }
    }
    if (dow === 'Tue') {
      const t = en(d, 10, 0)
      if (t > tope) continue
      const saldo = saldoHasta('demo-cash-usd', t)
      if (saldo > 0) transferir(t, 'demo-cash-usd', 'demo-transfer-itau', saldo, 'Depósito de dólares en Itaú', 'Cambio en el banco', 'Hernán Acosta')
    }
  }

  // 4. Caja diaria: apertura, cobros en efectivo, gastos chicos, depósito del día y arqueo.
  const sesiones = []
  let apertura = FONDO_CAJA
  for (let d = dias - 1; d >= 0; d -= 1) {
    const clave = diaDemo(d, ahora)
    const tApertura = en(d, 8, 30)
    const tCierre = en(d, 19, 30)
    const fila = cobrosDia.get(clave) || { efectivo: 0, pagos: 0, pedidos: new Set(), ventasPyg: 0 }
    const propios = []
    const h = hash(clave)
    if (d % 7 === 3 && d > 0) propios.push({ t: en(d, 9, 10), tipo: 'APORTE', concepto: 'Aporte de caja para vueltos', ingresoPyg: 300000, desde: 'demo-transfer-itau' })
    if (h % 3 === 0) { const [concepto, monto] = EGRESOS_CHICOS[h % EGRESOS_CHICOS.length]; propios.push({ t: en(d, 13, 10 + (h % 40)), tipo: 'GASTO', concepto, egresoPyg: monto }) }
    if (h % 5 === 1) { const [concepto, monto] = EGRESOS_CHICOS[(h >> 3) % EGRESOS_CHICOS.length]; propios.push({ t: en(d, 16, 5 + (h % 45)), tipo: 'GASTO', concepto, egresoPyg: monto }) }
    // Neto del día (sin depósito) con los gastos del libro que caen ese día en caja.
    const gastosCaja = eventos.filter((e) => e.cuentaId === 'demo-cash-pyg' && e.tipo === 'GASTO' && claveDia(e.t) === clave).reduce((suma, e) => suma + e.egresoPyg, 0)
    const aportes = propios.reduce((suma, e) => suma + (e.ingresoPyg || 0), 0)
    const gastosChicos = propios.reduce((suma, e) => suma + (e.egresoPyg || 0), 0)
    const cerrada = d > 0
    nuevo({ t: tApertura, cuentaId: 'demo-cash-pyg', tipo: 'APERTURA', concepto: 'Apertura de caja', detalle: `Fondo inicial ${formatGs(apertura)}`, user: 'Hernán Acosta', ref: `demo-cash-${clave}` })
    for (const p of propios) {
      if (p.t > tope) continue
      if (p.desde) {
        transferir(p.t, p.desde, 'demo-cash-pyg', p.ingresoPyg, p.concepto, 'Retiro bancario para caja', 'Hernán Acosta')
      } else nuevo({ t: p.t, cuentaId: 'demo-cash-pyg', tipo: p.tipo, concepto: p.concepto, egresoPyg: p.egresoPyg, user: 'Hernán Acosta', ref: `demo-cash-${clave}` })
    }
    const antesDeposito = apertura + fila.efectivo + aportes - gastosChicos - gastosCaja
    let deposito = 0
    let reposicion = 0
    let contado = null
    let diferencia = null
    if (cerrada) {
      if (antesDeposito > FONDO_CAJA) deposito = antesDeposito - FONDO_CAJA
      else reposicion = FONDO_CAJA - antesDeposito
      const tDep = en(d, 19, 15)
      if (deposito > 0) transferir(tDep, 'demo-cash-pyg', 'demo-transfer-itau', deposito, 'Depósito bancario del día', `Cierre del ${clave}`, 'Hernán Acosta')
      if (reposicion > 0) transferir(tDep, 'demo-transfer-itau', 'demo-cash-pyg', reposicion, 'Reposición del fondo de caja', 'Retiro bancario para dejar el fondo', 'Hernán Acosta')
      const esperado = FONDO_CAJA
      diferencia = d === 1 || d === 0 ? 0 : [0, 0, -15000, 0, 8000, 0, -5000, 0, 0, 12000][h % 10]
      contado = esperado + diferencia
      if (diferencia !== 0) nuevo({ t: tCierre, cuentaId: 'demo-cash-pyg', tipo: 'AJUSTE', concepto: diferencia < 0 ? 'Faltante de arqueo' : 'Sobrante de arqueo', detalle: `Contado ${formatGs(contado)} · esperado ${formatGs(esperado)}`, ingresoPyg: Math.max(0, diferencia), egresoPyg: Math.max(0, -diferencia), user: 'Hernán Acosta', ref: `demo-cash-${clave}` })
      nuevo({ t: tCierre + MIN, cuentaId: 'demo-cash-pyg', tipo: 'CIERRE', concepto: 'Cierre y arqueo de caja', detalle: `Esperado ${formatGs(esperado)} · contado ${formatGs(contado)} · diferencia ${formatGs(diferencia)}`, user: 'Hernán Acosta', ref: `demo-cash-${clave}` })
      const movimientosPyg = aportes - gastosChicos - gastosCaja - deposito + reposicion
      sesiones.push({
        id: `demo-cash-${clave}`, openedByName: 'Hernán Acosta', openedAt: new Date(antes(tApertura)).toISOString(), closedAt: new Date(antes(tCierre)).toISOString(),
        status: 'CLOSED', openingPyg: apertura, efectivoPyg: fila.efectivo, pagosEfectivo: fila.pagos, movimientosPyg,
        pedidos: fila.pedidos.size, ventasPyg: fila.ventasPyg, esperadoPyg: apertura + fila.efectivo + movimientosPyg,
        contadoPyg: contado - 0, diferenciaPyg: contado - (apertura + fila.efectivo + movimientosPyg), notes: '', depositoPyg: deposito, reposicionPyg: reposicion, dia: clave,
      })
      apertura = contado
    }
  }
  // La sesión abierta de hoy la arma la caja viva; acá solo se ordena el resto (más reciente primero).
  sesiones.reverse()

  // 5. Saldos corridos. La caja parte del fondo; el resto de un saldo inicial que evita negativos.
  const cuentas = CUENTAS_LIBRO.map((cuenta) => {
    const lista = ordenarCuenta(cuenta.id)
    let acumulado = 0
    let minimo = 0
    for (const e of lista) { acumulado += e.ingresoPyg - e.egresoPyg; minimo = Math.min(minimo, acumulado) }
    const aperturaCuenta = cuenta.id === 'demo-cash-pyg' ? FONDO_CAJA : (cuenta.kind === 'CARD' || cuenta.kind === 'PIX' || cuenta.kind === 'CRYPTO' || cuenta.kind === 'TRADE_IN' || cuenta.id === 'demo-cash-usd') ? Math.ceil(-minimo / 50000) * 50000 : Math.ceil(-minimo / 500000) * 500000 + 1500000
    let saldo = aperturaCuenta
    const movimientos = lista.map((e) => {
      saldo += e.ingresoPyg - e.egresoPyg
      return { id: `${cuenta.id}-${e.orden}`, at: new Date(e.t).toISOString(), cuentaId: cuenta.id, tipo: e.tipo, concepto: e.concepto, detalle: e.detalle, ingresoPyg: e.ingresoPyg, egresoPyg: e.egresoPyg, saldoPyg: saldo, user: e.user, ref: e.ref }
    }).reverse()
    return { ...cuenta, aperturaPyg: aperturaCuenta, saldoPyg: saldo, movimientos }
  })
  return { cuentas, sesiones, transferencias, ahora: tope }
}

/** Cronología (`/api/cash/sessions/:id/history`) de un turno de caja de la demo. */
export function historialCajaDemo(libros, sesionId, { esHoy = false } = {}) {
  const caja = libros.cuentas.find((c) => c.id === 'demo-cash-pyg')
  const dia = esHoy || sesionId === 'demo-cash-session' ? diaDemo(0, new Date(libros.ahora)) : String(sesionId).replace('demo-cash-', '')
  return caja.movimientos
    .filter((m) => claveDia(new Date(m.at).getTime()) === dia)
    .map((m) => ({ id: m.id, type: m.tipo === 'COBRO' || m.tipo === 'COBRO_CUOTA' ? 'payment' : m.tipo === 'GASTO' ? 'expense' : 'cash', action: m.concepto, label: m.concepto, createdAt: m.at, user: { id: 'demo', name: m.user }, detail: [m.detalle, m.ingresoPyg ? `+${formatGs(m.ingresoPyg)}` : '', m.egresoPyg ? `−${formatGs(m.egresoPyg)}` : '', `saldo ${formatGs(m.saldoPyg)}`].filter(Boolean).join(' · ') }))
}
