const GS_FORMATTER = new Intl.NumberFormat('es-PY', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

// Tamaños de monto de la app (épica #148, sección 9): el campo general
// soporta hasta 10.000.000.000 y las ventas hasta 99.000.000.000. El campo
// nunca recorta lo que se escribe; el formulario valida con estos límites.
export const LIMITE_MONTO_GENERAL = 10_000_000_000
export const LIMITE_MONTO_VENTAS = 99_000_000_000

// Tope real de almacenamiento: los importes viven en columnas enteras de 32
// bits, así que por encima de este valor el backend rechaza el guardado. Los
// campos marcan y los formularios bloquean con `errorMonto`; los límites de
// #148 (10B/99B) quedan como objetivo de producto pendiente de migrar.
export const LIMITE_MONTO_ALMACENABLE = 2_147_483_647

/** Límite efectivo de un campo: el del contexto, acotado a lo almacenable. */
export function limiteMonto(max = LIMITE_MONTO_GENERAL) {
  const valor = Number(max)
  return Number.isFinite(valor) && valor > 0 ? Math.min(valor, LIMITE_MONTO_ALMACENABLE) : LIMITE_MONTO_ALMACENABLE
}

/** Mensaje para bloquear el guardado, o '' si el monto entra. */
export function errorMonto(value, max = LIMITE_MONTO_GENERAL) {
  const limite = limiteMonto(max)
  return excedeMonto(value, limite) ? `El monto supera el máximo que el sistema puede guardar (Gs ${GS_FORMATTER.format(limite)}).` : ''
}

// ¿El monto supera el límite? Se usa para marcar el campo (`aria-invalid`) y
// para validar antes de guardar; nunca para truncar el valor tipeado.
export function excedeMonto(value, limite = LIMITE_MONTO_GENERAL) {
  const texto = String(value ?? '').trim().replace(/\./g, '').replace(',', '.')
  if (!texto) return false
  const numero = Number(texto)
  return Number.isFinite(numero) && Math.abs(numero) > limite
}

const USD_FORMATTER = new Intl.NumberFormat('es-PY', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatGs(value) {
  const amount = Number(value)
  return `Gs ${GS_FORMATTER.format(Number.isFinite(amount) ? Math.round(amount) : 0)}`
}

// Presentación editable: conserva solo dígitos y agrega separadores de miles.
// El valor guardado/calculado sigue siendo numérico mediante parseGsInput.
export function formatGsInput(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits ? GS_FORMATTER.format(Number(digits)) : ''
}

export function parseGsInput(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits ? Number(digits) : 0
}

const USD_INPUT_FORMATTER = new Intl.NumberFormat('es-PY', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

// Presentación editable para monedas decimales (USD/BRL/EUR/USDT):
// separador de miles con punto y 2 decimales con coma (es-PY).
export function formatUsdInput(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const amount = Number(text)
  return Number.isFinite(amount) ? USD_INPUT_FORMATTER.format(amount) : ''
}

// Convierte el texto del campo a un string decimal limpio (punto como
// separador decimal), en el mismo estilo que parseGsInput para guaraníes.
export function parseUsdInput(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const normalized = text.replace(/\./g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(normalized)) return ''
  return String(Number(normalized))
}

// Solo formatea un monto ya expresado en USD; nunca convierte desde PYG.
export function formatUsd(value) {
  const amount = Number(value)
  return `USD ${USD_FORMATTER.format(Number.isFinite(amount) ? amount : 0)}`
}

// Formato único de presentación. No convierte monedas: cada movimiento conserva
// su moneda y, cuando aplica, su cotización congelada en el backend.
export function formatMoney(value, currency = 'PYG') {
  return currency === 'USD' ? formatUsd(value) : formatGs(value)
}

// ── Montos de pantalla (el formato que ya usan ui/Money y las listas) ────────
// "Gs 12.500" y "US$ 1,234.56": es la presentación dominante del repo (la de
// `Money`, `gs()` y `formatGs`). Los montos se escriben con estos helpers y no
// con `toLocaleString` a mano; el vacío es explícito ('—' por defecto) para no
// mostrar 0 cuando falta el dato. No convierten moneda.
export function montoGs(value, vacio = '—') {
  const amount = numeroDe(value)
  return amount === null ? vacio : formatGs(amount)
}

export function montoUsd(value, vacio = '—') {
  const amount = numeroDe(value)
  return amount === null ? vacio : `US$ ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

export function montoTexto(value, currency = 'PYG', vacio = '—') {
  return currency === 'USD' ? montoUsd(value, vacio) : montoGs(value, vacio)
}

// null / undefined / '' no son 0: son dato ausente.
function numeroDe(value) {
  if (value === null || value === undefined || value === '') return null
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : null
}

// Largo máximo del texto de un monto: dígitos del tope + separadores de miles
// (+ 3 si la moneda lleva decimales). El campo lo usa como `maxLength`, así el
// monto más grande documentado entra completo y no se puede escribir de más.
export function largoMaximoMonto(max = LIMITE_MONTO_GENERAL, { decimales = false } = {}) {
  const digitos = String(Math.trunc(Math.abs(Number(max) || 0))).length
  const separadores = Math.floor((digitos - 1) / 3)
  return digitos + separadores + (decimales ? 3 : 0)
}
