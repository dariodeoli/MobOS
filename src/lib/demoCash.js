import { leerDemo, guardarDemo } from './demoStorage.js'
const KEY = 'mobos:demo-cash:v1'

// Espejo de esperadoCaja() de backend/lib/cash-expected-pure.ts: apertura + parte móvil, sin recorte.
export const esperadoCaja = (aperturaPyg, movilPyg) => Number(aperturaPyg) + Number(movilPyg)

const DEFAULT = {
  id: 'demo-cash-session',
  tenantId: 'mobos-demo',
  branchId: 'mobos-demo-central',
  openedById: 'demo-user',
  openedAt: null,
  openingPyg: 500000,
  status: 'OPEN',
  notes: 'Caja principal',
  // Movimientos de ejemplo (#213): aporte y retiro del turno.
  movements: [
    { id: 'demo-mov-1', kind: 'INGRESO', concept: 'Aporte de caja', amountPyg: 300000, createdAt: null, user: 'Hernán Acosta' },
    { id: 'demo-mov-2', kind: 'EGRESO', concept: 'Retiro para depósito bancario', amountPyg: 150000, createdAt: null, user: 'Hernán Acosta' },
  ],
}

// Inicio del día local en ISO: una caja abierta se muestra como "Turno de …"
// y su saldo esperado cuenta los cobros del día desde esa apertura.
function inicioDelDia(fecha = new Date()) {
  const dia = new Date(fecha)
  dia.setHours(0, 0, 0, 0)
  return dia.toISOString()
}

// Coherencia del seed demo (#188): una sesión OPEN siempre tiene apertura. Los
// datos guardados antes de esta corrección (openedAt null) se normalizan al
// leerlos, sin inventar una apertura para cajas cerradas.
function normalizar(cash) {
  if (!cash || cash.status !== 'OPEN' || cash.openedAt) return cash
  return { ...cash, openedAt: inicioDelDia() }
}

function read() {
  try {
    return normalizar(JSON.parse(leerDemo(KEY)) || { ...DEFAULT })
  } catch {
    return normalizar({ ...DEFAULT })
  }
}

// El demo responde con la misma forma que GET /api/cash: los campos de la
// sesión arriba y `session` con el turno, para que Caja.jsx no distinga demo
// de producción.
function envelope(cash) {
  return {
    ...cash,
    session: cash,
    openSessions:
      cash.status === 'OPEN'
        ? [
            {
              id: cash.id,
              openedById: cash.openedById,
              openedByName: cash.openedByName || 'Hernán Acosta',
              openedAt: cash.openedAt,
              openingPyg: cash.openingPyg,
            },
          ]
        : [],
    movements: (cash.movements || []).map(movimiento => ({ ...movimiento, createdAt: movimiento.createdAt || cash.openedAt || new Date().toISOString() })),
  }
}

export function getDemoCash() {
  return envelope(read())
}

// #148 §18: corte por sesión para el panel «Ventas por caja» de la demo. La
// sesión abierta sale de la caja local (apertura + movimientos + cobros en
// efectivo del día); las cerradas se derivan de los días anteriores para que el
// panel muestre el histórico con su diferencia. Mismo contrato que el endpoint.
export function construirDemoCajas({ cash = read(), ventas = [], dias = 3 } = {}) {
  const claveDeDia = (valor) => {
    const texto = String(valor || '')
    // Las ventas demo guardan la fecha como clave local `YYYY-MM-DD`: se
    // respeta tal cual (parsearla como Date la correría un día en UTC-3).
    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto
    const fecha = new Date(valor)
    if (Number.isNaN(fecha.getTime())) return ''
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
  }
  const porDia = new Map()
  for (const venta of ventas) {
    if (venta?.vendedorId !== 'demo-user') continue
    const dia = claveDeDia(venta.fecha || venta.creadoEn)
    if (!dia) continue
    const fila = porDia.get(dia) || { efectivoPyg: 0, pagosEfectivo: 0, pedidos: 0, ventasPyg: 0 }
    fila.pedidos += 1
    fila.ventasPyg += Number(venta.precio) || 0
    for (const pago of Array.isArray(venta.pagos) ? venta.pagos : []) {
      if (String(pago.medioPago || '').toUpperCase() !== 'DINERO') continue
      // Reembolso en efectivo: resta del cajón (igual que cashExpectedBetween() del servidor).
      if (pago.status === 'REFUNDED') { fila.efectivoPyg -= Math.abs(Number(pago.monto) || 0); continue }
      if (pago.status && pago.status !== 'CONFIRMED') continue
      fila.efectivoPyg += Number(pago.monto) || 0
      fila.pagosEfectivo += 1
    }
    porDia.set(dia, fila)
  }
  const movimientosPyg = (cash?.movements || []).reduce((suma, movimiento) => suma + (movimiento.kind === 'INGRESO' ? 1 : -1) * (Number(movimiento.amountPyg) || 0), 0)
  const diferencias = [-15000, 8000, 0]
  const sesiones = []
  for (let i = 0; i < dias; i += 1) {
    const fecha = new Date()
    fecha.setDate(fecha.getDate() - i)
    fecha.setHours(i === 0 ? 8 : 9, 30, 0, 0)
    const dia = porDia.get(claveDeDia(fecha)) || { efectivoPyg: 0, pagosEfectivo: 0, pedidos: 0, ventasPyg: 0 }
    const abierta = i === 0 && cash?.status === 'OPEN'
    const abiertaEn = i === 0 && cash?.openedAt ? new Date(cash.openedAt) : fecha
    const openingPyg = i === 0 ? Number(cash?.openingPyg ?? 500000) : 500000
    const movimientos = i === 0 ? movimientosPyg : 0
    const esperadoPyg = esperadoCaja(openingPyg, dia.efectivoPyg + movimientos)
    const contadoPyg = abierta ? null : esperadoPyg + diferencias[i % diferencias.length]
    sesiones.push({
      id: abierta ? (cash?.id || 'demo-cash-session') : `demo-cash-${claveDeDia(fecha)}`,
      openedByName: 'Hernán Acosta',
      openedAt: abiertaEn.toISOString(),
      closedAt: abierta ? null : new Date(fecha.getTime() + 9 * 3600000).toISOString(),
      status: abierta ? 'OPEN' : 'CLOSED',
      openingPyg,
      efectivoPyg: dia.efectivoPyg,
      pagosEfectivo: dia.pagosEfectivo,
      movimientosPyg: movimientos,
      pedidos: dia.pedidos,
      ventasPyg: dia.ventasPyg,
      esperadoPyg,
      contadoPyg,
      diferenciaPyg: contadoPyg === null ? null : contadoPyg - esperadoPyg,
      notes: abierta ? String(cash?.notes || '') : '',
    })
  }
  return sesiones
}
// Efectivo del turno POR MONEDA (#455), espejo de cashExpectedByCurrency() del servidor: un cobro
// suma lo realmente entregado en su moneda (tenderedAmount) y el vuelto sale como egreso en Gs.
export const esEfectivoDemo = (pago) => String(pago.medioPago || '').toUpperCase() === 'DINERO' || pago.method === 'CASH' || pago.accountSnapshot?.kind === 'CASH'
export function getDemoCashMovilPorMoneda(cash = read(), until = new Date(), sales = []) {
  const openedAt = new Date(cash.openedAt || 0).getTime()
  const end = new Date(until).getTime()
  const payments = sales.flatMap(sale => (sale.vendedorId === 'demo-user' ? sale.pagos || [] : []))
  const porMoneda = { PYG: 0, USD: 0 }
  for (const payment of payments) {
    const paidAt = new Date(payment.fecha || 0).getTime()
    if (!esEfectivoDemo(payment) || paidAt < openedAt || paidAt > end) continue
    const moneda = payment.currency || 'PYG'
    const monto = Number(payment.amountPyg ?? payment.monto) || 0
    // Reembolso en efectivo: resta del cajón (igual que cashExpectedByCurrency() del servidor).
    if (payment.status === 'REFUNDED') { porMoneda.PYG -= Math.abs(monto); continue }
    if (payment.status && payment.status !== 'CONFIRMED') continue
    const aplicado = moneda === 'PYG' ? monto : Number(payment.originalAmount) || 0
    const entregado = Number(String(payment.tenderedAmount ?? '').replace(',', '.')) || 0
    const cobrado = entregado > aplicado ? entregado : aplicado
    porMoneda[moneda] = (porMoneda[moneda] || 0) + cobrado
    if (entregado > aplicado) {
      const rate = moneda === 'PYG' ? 1 : Number(payment.exchangeRatePyg) || 0
      porMoneda.PYG -= Math.max(0, Math.round(entregado * rate) - monto)
    }
  }
  // Ingresos y egresos de caja del turno (aportes, retiros, gastos): suman o restan igual que en el servidor.
  for (const movimiento of cash.movements || []) {
    const cuando = new Date(movimiento.createdAt || cash.openedAt || 0).getTime()
    if (cuando < openedAt || cuando > end) continue
    porMoneda.PYG += (movimiento.kind === 'INGRESO' ? 1 : -1) * (Number(movimiento.amountPyg) || 0)
  }
  for (const moneda of Object.keys(porMoneda)) porMoneda[moneda] = moneda === 'PYG' ? Math.round(porMoneda[moneda]) : Math.round(porMoneda[moneda] * 100) / 100
  return porMoneda
}
// Esperado por moneda: la misma fórmula con signo (esperadoCaja) para cada moneda; la apertura es solo en Gs.
export function getDemoCashExpectedByCurrency(cash = read(), until = new Date(), sales = []) {
  const movil = getDemoCashMovilPorMoneda(cash, until, sales)
  const salida = {}
  for (const moneda of new Set(['PYG', 'USD', ...Object.keys(movil)])) {
    salida[moneda] = esperadoCaja(moneda === 'PYG' ? Number(cash.openingPyg) || 0 : 0, movil[moneda] || 0)
  }
  return salida
}
export function getDemoCashExpected(cash = read(), until = new Date(), sales = []) {
  // Misma definición que el cierre real (backend/lib/cash-expected.ts, esperadoCaja): apertura + cobros en
  // efectivo − reembolsos ± movimientos, con signo y sin recortar en cero.
  return getDemoCashExpectedByCurrency(cash, until, sales).PYG
}
export function openDemoCash(openingPyg = DEFAULT.openingPyg, notes = '') {
  const next = {
    ...DEFAULT,
    openedAt: new Date().toISOString(),
    openingPyg: Number(openingPyg) || 0,
    notes,
    status: 'OPEN',
  }
  guardarDemo(KEY, JSON.stringify(next))
  return envelope(next)
}
export function closeDemoCash(countedPyg, expectedPyg, notes = '', countedBreakdown = null) {
  const current = read()
  const next = {
    ...current,
    countedPyg: Number(countedPyg) || 0,
    expectedPyg: Number(expectedPyg) || 0,
    differencePyg: (Number(countedPyg) || 0) - (Number(expectedPyg) || 0),
    countedBreakdown,
    closedAt: new Date().toISOString(),
    closedById: 'demo-user',
    status: 'CLOSED',
    notes,
  }
  guardarDemo(KEY, JSON.stringify(next))
  return envelope(next)
}
