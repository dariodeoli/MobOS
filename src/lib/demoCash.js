import { leerDemo, guardarDemo } from './demoStorage.js'
const KEY = 'mobos:demo-cash:v1'

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
export function getDemoCashExpected(cash = read(), until = new Date(), sales = []) {
  const openedAt = new Date(cash.openedAt || 0).getTime()
  const end = new Date(until).getTime()
  const payments = sales.flatMap(sale => (sale.vendedorId === 'demo-user' ? sale.pagos || [] : []))
  const cashTotal = payments.reduce((sum, payment) => {
    const paidAt = new Date(payment.fecha || 0).getTime()
    const isCash = String(payment.medioPago || '').toUpperCase() === 'DINERO'
    return isCash && paidAt >= openedAt && paidAt <= end ? sum + (Number(payment.monto) || 0) : sum
  }, 0)
  return (Number(cash.openingPyg) || 0) + cashTotal
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
