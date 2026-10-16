import { EMPRESA_DEMO } from './demo/empresa.js'
import { leerDemo, guardarDemo } from './demoStorage.js'
import { VENTAS_DEMO } from './demo/ventas.js'
// Ajustes ficticios de la empresa en modo demo (#194): se guardan solo en este
// navegador y alimentan la simulación de Finanzas sin tocar la API real. Mismos
// nombres de campos que el tenant real para que las pantallas no distingan.

const KEY = 'mobos:demo-tenant:v1'

// Solo datos ficticios: los valores guardados por la persona siempre prevalecen.
const DEFAULTS = {
  id: EMPRESA_DEMO.id,
  name: EMPRESA_DEMO.razonSocial,
  email: EMPRESA_DEMO.email,
  phone: EMPRESA_DEMO.telefono,
  ruc: EMPRESA_DEMO.ruc,
  address: EMPRESA_DEMO.direccion,
  city: EMPRESA_DEMO.city,
  department: EMPRESA_DEMO.department,
  instagram: EMPRESA_DEMO.instagram,
  insurancePct: 0,
  expenseLimitPyg: 1000000,
  purchaseCreditLimitPyg: 5000000,
  belowListPct: 10,
  loyaltyPct: 0,
  collectionLateFeeBpPerDay: null,
  orderPrefix: 'AUR',
  orderNextNumber: 1,
}

function read() {
  try {
    const guardado = JSON.parse(leerDemo(KEY))
    return guardado && typeof guardado === 'object' && !Array.isArray(guardado) ? { ...DEFAULTS, ...guardado } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

function write(next) {
  try { guardarDemo(KEY, JSON.stringify(next)) } catch { /* almacenamiento no disponible */ }
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

// Números ya usados por las ventas guardadas en el navegador: `storage.js` registra
// quién los lista (este módulo no puede importar storage sin un ciclo).
let proveedorNumerosUsados = () => []
export function registrarNumerosUsadosDemo(proveedor) {
  proveedorNumerosUsados = typeof proveedor === 'function' ? proveedor : () => []
}

const secuenciaDe = (numero, prefijo) => {
  const coincide = String(numero ?? '').trim().match(/^([A-Z]{2,3})[- ]?#?(\d+)$/)
  return coincide && coincide[1] === prefijo ? Number(coincide[2]) : 0
}

/**
 * Próximo número de pedido de la demo y lo deja consumido. Nunca repite uno ya usado:
 * salta por encima de las ventas sembradas y de las guardadas en este navegador, y
 * la conversión de una cotización toma uno nuevo igual que el POS (#461).
 * Se guarda sin «#» (AUR-0003); la pantalla muestra siempre `codigoPedido()`.
 */
export function tomarNumeroPedidoDemo() {
  const actual = read()
  const usados = [...VENTAS_DEMO.map((venta) => venta.numero), ...proveedorNumerosUsados()]
  const maximo = usados.reduce((mayor, numero) => Math.max(mayor, secuenciaDe(numero, actual.orderPrefix)), 0)
  const secuencia = Math.max(Number(actual.orderNextNumber) || 1, maximo + 1)
  write({ ...actual, orderNextNumber: secuencia + 1 })
  return `${actual.orderPrefix}-${String(secuencia).padStart(4, '0')}`
}

export function setDemoNumeracion({ prefix, start } = {}) {
  const next = read()
  if (typeof prefix === 'string') next.orderPrefix = prefix
  if (Number.isSafeInteger(start) && start > 0) next.orderNextNumber = start
  write(next)
  return next
}
