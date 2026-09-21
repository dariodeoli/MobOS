import { almacenamientoDemo } from './demoStorage.js'
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

// En la demo el carrito vive solo en memoria (#204): no se guarda al recargar.
const storage = () => almacenamientoDemo()

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

// Líneas del carrito listas para mostrar: el nombre lleva la cantidad y cada
// línea expone su subtotal (precio unitario × cantidad). El total del resumen
// sale de sumar `subtotal`, nunca de multiplicar otra vez en la vista.
export function lineasParaResumen(items) {
  if (!Array.isArray(items)) return []
  return items.map(it => {
    const cantidad = Number(it?.quantity) > 0 ? Number(it.quantity) : 1
    return {
      ...it,
      quantity: cantidad,
      nombre: cantidad > 1 ? `${it?.nombre || ''} ×${cantidad}` : it?.nombre || '',
      subtotal: (Number(it?.precio) || 0) * cantidad,
    }
  })
}

export function totalResumen(lineas) {
  if (!Array.isArray(lineas)) return 0
  return lineas.reduce((suma, it) => suma + (Number(it?.subtotal) || 0), 0)
}


// Punto de entrada para la acción masiva «Vender todos» de Inventario (#217):
// deja el carrito del POS precargado con los productos elegidos (cantidad y
// seriales opcionales) y el vendedor solo revisa y cobra. Se llama antes de
// navegar a /pos; el POS lo levanta solo (leerCarritoInicial) y lo borra al
// guardar la venta. Devuelve false si no hay contexto o no hay items válidos.
export function prepararVentaDesdeInventario({ empresaId, sucursalId, items = [], customer = null, entrega, montoDelivery, observacion } = {}) {
  const normalizados = (Array.isArray(items) ? items : [])
    .filter(Boolean)
    .map(({ productoId, id, quantity, serials, ...resto }) => ({
      productoId: productoId || id,
      quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : 1,
      ...(Array.isArray(serials) && serials.length ? { serials } : {}),
      ...resto,
    }))
    .filter((item) => item.productoId)
  if (!empresaId || !normalizados.length) return false
  return guardarCarrito(empresaId, sucursalId, {
    items: normalizados,
    ...(customer ? { customer } : {}),
    ...(entrega ? { entrega } : {}),
    ...(montoDelivery ? { montoDelivery } : {}),
    ...(observacion ? { observacion } : {}),
  })
}
