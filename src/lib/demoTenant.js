// Ajustes ficticios de la empresa en modo demo (#194): se guardan solo en este
// navegador y alimentan la simulación de Finanzas sin tocar la API real. Mismos
// nombres de campos que el tenant real para que las pantallas no distingan.

const KEY = 'mobos:demo-tenant:v1'

const DEFAULTS = {
  insurancePct: 0,
  expenseLimitPyg: 1000000,
  purchaseCreditLimitPyg: 5000000,
  belowListPct: 10,
  loyaltyPct: 0,
  collectionLateFeeBpPerDay: null,
  orderPrefix: 'DEMO',
  orderNextNumber: 1,
}

function read() {
  try {
    const guardado = JSON.parse(localStorage.getItem(KEY))
    return guardado && typeof guardado === 'object' && !Array.isArray(guardado) ? { ...DEFAULTS, ...guardado } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

function write(next) {
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* almacenamiento no disponible */ }
  return next
}

export function getDemoTenant() {
  return read()
}

/** % de seguro predeterminado de la empresa demo (0 = desactivado). */
export function getDemoInsurancePct() {
  const pct = Number(read().insurancePct)
  return Number.isFinite(pct) && pct > 0 ? Math.min(100, pct) : 0
}

export function setDemoInsurancePct(pct) {
  const next = read()
  const valor = pct === null || pct === '' || Number.isNaN(Number(pct)) ? 0 : Math.max(0, Math.min(100, Number(pct)))
  next.insurancePct = valor
  write(next)
  return valor
}

export function setDemoLimits(limits = {}) {
  const next = { ...read(), ...limits }
  write(next)
  return next
}

export function setDemoNumeracion({ prefix, start } = {}) {
  const next = read()
  if (typeof prefix === 'string') next.orderPrefix = prefix
  if (Number.isSafeInteger(start) && start > 0) next.orderNextNumber = start
  write(next)
  return next
}
