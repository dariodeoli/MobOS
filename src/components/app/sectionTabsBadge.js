// #357 · Contador por pestaña de SectionTabs. Lógica pura (sin React) para
// poder probarla: cuenta válida, tope visual y etiqueta accesible.

export const BADGE_TOPE = 99

// Solo cuentan enteros positivos; 0, vacío o inválido ocultan el contador.
export function cuentaBadge(valor) {
  const n = Math.floor(Number(valor))
  return Number.isFinite(n) && n > 0 ? n : 0
}

export const textoBadge = (cuenta) => (cuenta > BADGE_TOPE ? `${BADGE_TOPE}+` : String(cuenta))

// «3 pendientes» / «1 pendiente». `plural` por defecto «pendientes».
export function etiquetaBadge(cuenta, plural = 'pendientes') {
  const singular = plural.endsWith('s') ? plural.slice(0, -1) : plural
  return `${cuenta} ${cuenta === 1 ? singular : plural}`
}

// null si no hay nada que mostrar; si no, lo que la pestaña necesita pintar.
export function infoBadge(item) {
  const cuenta = cuentaBadge(item?.badge)
  if (!cuenta) return null
  return { cuenta, texto: textoBadge(cuenta), etiqueta: etiquetaBadge(cuenta, item?.badgeLabel || undefined) }
}

// Nombre accesible del botón: «Por aprobar, 3 pendientes».
export const nombreConBadge = (item) => {
  const info = infoBadge(item)
  return info ? `${item.label}, ${info.etiqueta}` : undefined
}
