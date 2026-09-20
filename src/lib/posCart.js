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

// Precios vigentes de un carrito suspendido al retomarlo. `precios` es un mapa
// por `key` de fila con la resolución autoritativa del servidor
// (`{ unitPricePyg, unitPricePygFallback?, origin, priceList?, minQty?, ... }`).
// Devuelve las filas con el precio nuevo y la lista de cambios para avisarle a
// quien retoma. Las filas con precio manual, cupón o combo conservan su precio:
// fueron una decisión de la venta, no una lista vigente.
export function resolverCarritoSuspendido(items, precios = {}) {
  const cambios = []
  const filas = Array.isArray(items) ? items : []
  const resueltas = filas.map((item) => {
    if (!item || typeof item !== 'object') return item
    if (item.precioManual || item.couponCode || item.combo) return item
    const info = precios[item.key]
    if (!info) return item
    const precioNuevo = Number(info.unitPricePygFallback ?? info.unitPricePyg)
    if (!Number.isFinite(precioNuevo) || precioNuevo <= 0) return item
    const precioViejo = Number(item.precio) || 0
    if (precioNuevo === precioViejo) return item
    cambios.push({
      key: item.key,
      nombre: typeof item.nombre === 'string' ? item.nombre : '',
      antes: precioViejo,
      despues: precioNuevo,
      origen: typeof info.origin === 'string' ? info.origin : '',
    })
    return {
      ...item,
      precio: precioNuevo,
      precioOrigen: info.origin ?? item.precioOrigen ?? null,
      precioLista: info.priceList?.name ?? null,
      precioMinQty: info.minQty ?? null,
      precioUsd: info.currency === 'USD' ? Number(info.unitPriceUsd) : null,
      precioListaValor: info.currency === 'USD' ? null : precioNuevo,
    }
  })
  return { items: resueltas, cambios }
}
