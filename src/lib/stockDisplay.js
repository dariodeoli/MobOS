// Presentación del Stock (#448): colores por condición y depósito, y el orden
// por defecto (tipo y condición primero). Puro, sin React ni red, para probarlo
// con node:test. La preferencia de la empresa vive en Tenant.settings.stockDisplay
// (GET/PUT /api/tenant/stock-display); cada usuario puede pisarla con la suya.

/** Valores del selector de «tipo primero» (los mismos de `stockKind` de la API). */
export const TIPOS_PRIMERO = Object.freeze([
  ['', 'Sin preferencia'],
  ['EQUIPO', 'Teléfonos y equipos'],
  ['ACCESORIO', 'Accesorios'],
  ['REPUESTO', 'Repuestos'],
  ['OTRO', 'Otros'],
])
export const CONDICIONES_PRIMERO = Object.freeze([
  ['', 'Sin preferencia'],
  ['nuevo', 'Nuevos arriba, semi nuevos abajo'],
  ['semi', 'Semi nuevos arriba, nuevos abajo'],
])

export const CONFIG_VACIA = Object.freeze({ tipoPrimero: '', condicionPrimero: '', colores: Object.freeze({}), planilla: Object.freeze({}) })

import { normalizarPlanilla } from './planillaPrefs.js'

const HEX = /^#[0-9a-fA-F]{6}$/

/** Fondos de fábrica (los tokens --cond-* de index.css, #435), claro y oscuro. */
export const COLORES_BASE = Object.freeze({
  claro: Object.freeze({ nuevo: '#dcf3e5', semi: '#fef0be' }),
  oscuro: Object.freeze({ nuevo: '#163a26', semi: '#42340e' }),
})
export const TEXTO_CLARO = '#0f172a'
export const TEXTO_OSCURO = '#f8fafc'

export function normalizarConfig(crudo) {
  const base = crudo && typeof crudo === 'object' && !Array.isArray(crudo) ? crudo : {}
  const tipoPrimero = TIPOS_PRIMERO.some(([clave]) => clave === base.tipoPrimero) ? base.tipoPrimero : ''
  const condicionPrimero = CONDICIONES_PRIMERO.some(([clave]) => clave === base.condicionPrimero) ? base.condicionPrimero : ''
  const colores = {}
  for (const [clave, valor] of Object.entries(base.colores && typeof base.colores === 'object' ? base.colores : {})) {
    const nuevo = HEX.test(valor?.nuevo || '') ? valor.nuevo.toLowerCase() : ''
    const semi = HEX.test(valor?.semi || '') ? valor.semi.toLowerCase() : ''
    if (nuevo || semi) colores[clave] = { ...(nuevo ? { nuevo } : {}), ...(semi ? { semi } : {}) }
  }
  return { tipoPrimero, condicionPrimero, colores, planilla: normalizarPlanilla(base.planilla) }
}

// ── Contraste (WCAG 2.x) ──────────────────────────────────────────────────
export function hexARgb(hex) {
  const limpio = String(hex || '').replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(limpio)) return null
  return [0, 2, 4].map((i) => parseInt(limpio.slice(i, i + 2), 16))
}
const canal = (valor) => {
  const c = valor / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
export function luminancia(hex) {
  const rgb = hexARgb(hex)
  if (!rgb) return 0
  return 0.2126 * canal(rgb[0]) + 0.7152 * canal(rgb[1]) + 0.0722 * canal(rgb[2])
}
export function contraste(a, b) {
  const [alto, bajo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (alto + 0.05) / (bajo + 0.05)
}
const aHex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`
const mezclar = (a, b, parte) => {
  const [ra, rb] = [hexARgb(a), hexARgb(b)]
  return aHex(ra.map((v, i) => v * (1 - parte) + rb[i] * parte))
}

/** Texto principal sobre un fondo: el de mayor contraste (siempre ≥ 4.5:1 con estos dos). */
export function textoSobre(fondo) {
  const suaves = [TEXTO_CLARO, TEXTO_OSCURO].filter((texto) => contraste(fondo, texto) >= 4.5)
  if (suaves.length) return suaves.sort((x, y) => contraste(fondo, y) - contraste(fondo, x))[0]
  // Grises medios: ningún texto suave llega a 4.5:1, el negro o el blanco puros sí (≥ 4.58).
  return contraste(fondo, '#000000') >= contraste(fondo, '#ffffff') ? '#000000' : '#ffffff'
}

/** Fondo, borde, texto y texto secundario de una fila con ese color de fondo. */
export function paletaFila(fondo) {
  const fg = textoSobre(fondo)
  // Secundario: el principal suavizado, solo mientras siga ≥ 4.5:1.
  let fg2 = fg
  for (const parte of [0.3, 0.2, 0.1]) {
    const candidato = mezclar(fg, fondo, parte)
    if (contraste(candidato, fondo) >= 4.5) { fg2 = candidato; break }
  }
  const bd = mezclar(fondo, luminancia(fg) < 0.5 ? '#000000' : '#ffffff', 0.18)
  return { bg: fondo, bd, fg, fg2 }
}

const claveCondicion = (item) => (item?.condition === 'NEW' ? 'nuevo' : 'semi')

/** Color de fondo configurado para esa unidad (depósito > «todos»), o '' si usa los de fábrica. */
export function colorConfigurado(item, config) {
  const colores = config?.colores || {}
  const condicion = claveCondicion(item)
  const porDeposito = item?.locationId ? colores[item.locationId]?.[condicion] : ''
  return porDeposito || colores['*']?.[condicion] || ''
}

/** Estilo en línea (variables CSS de la fila) cuando hay un color propio; `undefined` usa los tokens. */
export function estiloCondicion(item, config) {
  const fondo = colorConfigurado(item, config)
  if (!fondo) return undefined
  const { bg, bd, fg, fg2 } = paletaFila(fondo)
  const rgb = (hex) => hexARgb(hex).join(' ')
  return { '--pl-bg': rgb(bg), '--pl-bd': rgb(bd), '--pl-fg': rgb(fg), '--pl-fg2': rgb(fg2) }
}

// ── Orden por defecto ────────────────────────────────────────────────────
/**
 * Preferencia efectiva: la del usuario (si eligió una) pisa campo a campo la de la
 * empresa. Un campo '' del usuario significa «como la tienda».
 */
export function preferenciaEfectiva(empresa, usuario) {
  const e = normalizarConfig(empresa)
  const u = normalizarConfig(usuario)
  return { tipoPrimero: u.tipoPrimero || e.tipoPrimero, condicionPrimero: u.condicionPrimero || e.condicionPrimero }
}

export const hayPreferenciaDeOrden = (pref) => Boolean(pref?.tipoPrimero || pref?.condicionPrimero)

/**
 * Orden estable por preferencia: primero el tipo elegido, después la condición;
 * dentro de cada grupo se conserva el orden de entrada (el de la API o el elegido).
 */
export function ordenarPorPreferencia(items = [], pref = CONFIG_VACIA) {
  const lista = Array.isArray(items) ? items : []
  if (!hayPreferenciaDeOrden(pref)) return lista
  const rango = (item) => {
    const tipo = pref.tipoPrimero ? (item?.stockKind === pref.tipoPrimero ? 0 : 1) : 0
    const nuevo = item?.condition === 'NEW'
    const condicion = pref.condicionPrimero ? ((pref.condicionPrimero === 'nuevo') === nuevo ? 0 : 1) : 0
    return tipo * 2 + condicion
  }
  return lista.map((item, indice) => [item, indice]).sort((a, b) => rango(a[0]) - rango(b[0]) || a[1] - b[1]).map(([item]) => item)
}
