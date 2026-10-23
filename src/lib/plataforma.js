import { Capacitor } from '@capacitor/core'

// Plataforma de ejecución. La app de iPhone empaqueta esta misma UI con
// Capacitor: en el navegador todo queda como siempre; dentro del contenedor
// nativo cambian la sesión (Bearer + Keychain), el login (Apple) y los
// puntos de entrada que Apple no admite (landing, alta de tienda, Google).
// Todas las funciones aceptan un `capacitor` inyectable para poder probarlas.

const PLATAFORMA_BUILD = String(import.meta.env?.VITE_PLATFORM || '').toLowerCase()
const VERSION_BUILD = String(import.meta.env?.VITE_APP_VERSION || '0.0.0')

let versionNativa = ''

/** Plataforma real del contenedor: 'ios' | 'android' | 'web'. */
export function plataforma(capacitor = Capacitor) {
  try { return capacitor?.getPlatform?.() || 'web' } catch { return 'web' }
}

/** true solo dentro de la app de iPhone (no en Safari ni en un build web). */
export function isNativeIOS(capacitor = Capacitor) {
  try {
    if (capacitor?.isNativePlatform && !capacitor.isNativePlatform()) return false
    return plataforma(capacitor) === 'ios'
  } catch { return false }
}

/** El build se generó para iOS (VITE_PLATFORM=ios): oculta landing y alta. */
export function esBuildIOS() {
  return PLATAFORMA_BUILD === 'ios'
}

/** Versión de la app: la del bundle nativo si ya se leyó; si no, la del build. */
export function versionApp() {
  return versionNativa || VERSION_BUILD
}

export function fijarVersionNativa(version) {
  if (typeof version === 'string' && version.trim()) versionNativa = version.trim()
}

/** Valor del encabezado `X-MobOS-Client` que exige el API a los clientes nativos. */
export function clienteNativo(version = versionApp()) {
  return `ios/${version}`
}

/** Compara versiones «1.2.3»: -1, 0 o 1. Los segmentos faltantes valen 0. */
export function compararVersiones(a, b) {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/** La app instalada es más vieja que la mínima que acepta el servidor. */
export function requiereActualizar(version, minima) {
  if (!minima) return false
  return compararVersiones(version, minima) < 0
}

// Enlace de soporte para tiendas sin vincular (Apple pide una vía de contacto).
export const SOPORTE_URL = 'mailto:soporte@moboss.online'
// Se completa con el ID real de la ficha cuando exista en App Store Connect.
export const APP_STORE_URL = 'https://apps.apple.com/app/mobos/id0000000000'

// Paridad con la web (#paridad-ios): la app de iPhone muestra las mismas secciones
// y vistas que la web y se rige por los módulos v2 de la empresa
// (`useModulos().vistaVisible`), no por una lista fija de plataforma. Lo único que
// la app no ofrece son los puntos de entrada que Apple no admite (guideline 3.1.1):
// landing con planes, alta de tienda y cobro del plan de MobOS.
