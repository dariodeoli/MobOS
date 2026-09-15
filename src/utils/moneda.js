const GS_FORMATTER = new Intl.NumberFormat('es-PY', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

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
