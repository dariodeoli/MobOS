// Demo · edición de productos del catálogo. Escribe en el catálogo de la sesión
// (storage.updateProducto) con los campos del API y los propios de la demo, así
// el listado, el POS y la ficha leen lo mismo. Se reinicia al salir.
import { getProductos, updateProducto } from '../storage.js'

/** Aplica un PATCH /api/products (payload del API) sobre el producto demo. */
export function actualizarProductoDemo(actual, payload = {}) {
  const { id, ...campos } = payload
  const cambios = { ...campos }
  if (campos.pricePyg !== undefined) cambios.precioVenta = campos.pricePyg
  if (campos.costPyg !== undefined) cambios.precioCosto = campos.costPyg ?? 0
  // La ficha manda valores por defecto (p. ej. categoría «Otros»): no se pisan datos que el producto demo no trae.
  for (const clave of ['category', 'condition', 'model', 'color', 'capacity']) {
    if (cambios[clave] !== undefined && actual[clave] === undefined) delete cambios[clave]
  }
  updateProducto(id || actual.id, cambios)
  return { ...actual, ...(getProductos().find((p) => p.id === (id || actual.id)) || {}), ...cambios }
}

/** «Desactivar» un producto: sale del catálogo y del POS (activo = false). */
export function desactivarProductoDemo(id) {
  updateProducto(id, { activo: false })
}
