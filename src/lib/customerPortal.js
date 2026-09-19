// Enlace público del portal del cliente (resumen de cuenta por QR). Mismo
// criterio que los comprobantes: la URL configurada manda y, en su defecto, el
// origen donde corre la app.
const publicBase = () =>
  String(import.meta.env.VITE_PUBLIC_TRACKING_URL || '').replace(/\/$/, '') ||
  (typeof window !== 'undefined' ? window.location.origin : '')

export const portalUrlFor = (token) => {
  const base = publicBase()
  return token && base ? `${base}/cuenta/${encodeURIComponent(token)}` : ''
}
