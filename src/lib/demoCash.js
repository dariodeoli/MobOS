const KEY = 'mobos:demo-cash:v1'

const DEFAULT = {
  id: 'demo-cash-session',
  tenantId: 'mobos-demo',
  branchId: 'mobos-demo-central',
  openedById: 'demo-user',
  openedAt: null,
  openingPyg: 500000,
  status: 'OPEN',
  notes: 'Caja demo local',
}

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || { ...DEFAULT }
  } catch {
    return { ...DEFAULT }
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
              openedByName: cash.openedByName || 'demo-user',
              openedAt: cash.openedAt,
              openingPyg: cash.openingPyg,
            },
          ]
        : [],
    movements: [],
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
  localStorage.setItem(KEY, JSON.stringify(next))
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
  localStorage.setItem(KEY, JSON.stringify(next))
  return envelope(next)
}
