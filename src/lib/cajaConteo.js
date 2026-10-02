// Conteo y cierre de caja (#311): denominaciones del arqueo, totales y modos
// del cierre guiado. Puro y sin React: Caja.jsx dibuja y estos helpers deciden
// qué monto vale (rápido por total o detallado por denominación), para que no
// haya dos números compitiendo al cerrar.

// Denominaciones del arqueo en guaraníes: las mismas que acepta el backend.
export const DENOMINACIONES = [
  { valor: 100000, tipo: 'Billete' },
  { valor: 50000, tipo: 'Billete' },
  { valor: 20000, tipo: 'Billete' },
  { valor: 10000, tipo: 'Billete' },
  { valor: 5000, tipo: 'Billete' },
  { valor: 2000, tipo: 'Billete' },
  { valor: 1000, tipo: 'Moneda' },
  { valor: 500, tipo: 'Moneda' },
  { valor: 100, tipo: 'Moneda' },
]

// Modos del cierre guiado: el rápido pide solo el total; el detallado suma las
// denominaciones cargadas. El activo es el único monto que se envía.
export const MODO_RAPIDO = 'RAPIDO'
export const MODO_DETALLADO = 'DETALLADO'

export function desgloseItems(cantidades = {}) {
  return DENOMINACIONES.map(({ valor }) => ({
    valor,
    cantidad: Number(cantidades[valor] || 0),
  })).filter(item => item.cantidad > 0)
}

export function totalArqueo(cantidades = {}) {
  return desgloseItems(cantidades).reduce((total, item) => total + item.valor * item.cantidad, 0)
}

export function desglosePayload(cantidades = {}) {
  const payload = {}
  for (const item of desgloseItems(cantidades)) payload[String(item.valor)] = item.cantidad
  return payload
}

// Normaliza una cantidad tipeada o sumada con los botones del conteo detallado:
// entero, sin signo y con el tope del campo (7 dígitos por denominación).
export function normalizarCantidad(valor, maximo = 9999999) {
  const numero = Math.floor(Number(valor) || 0)
  if (!Number.isFinite(numero) || numero <= 0) return ''
  return String(Math.min(numero, maximo))
}

/**
 * Monto que vale para el cierre según el modo activo y su resumen.
 * `hayConteo` distingue «no conté nada» de un conteo en cero real (el cierre se
 * habilita solo cuando hay un número cargado en el modo activo).
 */
export function resumenConteo({ modo = MODO_RAPIDO, cantidades = {}, totalRapido = 0, esperado = 0 } = {}) {
  const detallado = modo === MODO_DETALLADO
  const items = detallado ? desgloseItems(cantidades) : []
  const contado = detallado ? items.reduce((total, item) => total + item.valor * item.cantidad, 0) : Number(totalRapido) || 0
  const hayConteo = detallado
    ? items.length > 0
    : String(totalRapido ?? '').trim() !== ''
  return { contado, hayConteo, esperado: Number(esperado) || 0, diferencia: contado - (Number(esperado) || 0), items }
}
