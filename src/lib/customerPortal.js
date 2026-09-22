import { publicUrls } from './urls.js'

// Enlace público del portal del cliente (resumen de cuenta por QR). En
// producción vive en su propio subdominio; en desarrollo se conserva el origen
// local para que los e2e no salten a datos reales. VITE_CLIENT_PORTAL_URL
// permite un entorno de staging independiente.
const env = import.meta.env || {}

const publicBase = () =>
  String(env.VITE_CLIENT_PORTAL_URL || '').replace(/\/$/, '') ||
  (env.DEV && typeof window !== 'undefined' ? window.location.origin : publicUrls.clientPortal)

export const portalUrlFor = (token) => {
  const base = publicBase()
  return token && base ? `${base}/cuenta/${encodeURIComponent(token)}` : ''
}

// Vitrina resumida del cliente (misma cuenta, vista liviana de pedidos,
// garantías y saldo): comparte token y nivel con el portal completo.
export const portalVitrinaUrlFor = (token) => {
  const base = publicBase()
  return token && base ? `${base}/portal/${encodeURIComponent(token)}` : ''
}

// Nivel del enlace del portal (la etiqueta la muestra la cuenta pública).
export const NIVELES_PORTAL = { rapido: 'Resumen rápido', completo: 'Resumen completo' }
