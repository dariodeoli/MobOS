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

// Solo formatea un monto ya expresado en USD; nunca convierte desde PYG.
export function formatUsd(value) {
  const amount = Number(value)
  return `USD ${USD_FORMATTER.format(Number.isFinite(amount) ? amount : 0)}`
}
