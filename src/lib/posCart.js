// Carrito persistente del POS (carga de venta). Vive en localStorage, fuera de
// la capa de storage.js, porque en modo API no hay espejo local que lo guarde:
// un vendedor que recarga la página debe recuperar la venta a medio armar.
//
// Clave con empresa y sucursal (cuando la sesión la define): evita que un
// carrito armado en una sucursal aparezca en otra de la misma empresa. Sin
// sucursal conocida se usa solo la empresa.
const PREFIJO = 'mobos:pos-cart:v1'

export function claveCarrito(empresaId, sucursalId) {
  if (!empresaId) return null
  return sucursalId ? `${PREFIJO}:${empresaId}:${sucursalId}` : `${PREFIJO}:${empresaId}`
}

function storage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    /* localStorage bloqueado */
  }
  return null
}

// Devuelve el carrito guardado o null si no existe, está corrupto o el
// almacenamiento no está disponible (cuota, modo privado, etc.).
export function leerCarrito(empresaId, sucursalId) {
  const key = claveCarrito(empresaId, sucursalId)
  if (!key) return null
  try {
    const raw = storage()?.getItem(key)
    if (raw == null) return null
    const data = JSON.parse(raw)
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null
  } catch {
    return null
  }
}

export function guardarCarrito(empresaId, sucursalId, data) {
  const key = claveCarrito(empresaId, sucursalId)
  if (!key || data == null) return false
  try {
    storage()?.setItem(key, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

export function borrarCarrito(empresaId, sucursalId) {
  const key = claveCarrito(empresaId, sucursalId)
  if (!key) return
  try {
    storage()?.removeItem(key)
  } catch {
    /* noop */
  }
}
