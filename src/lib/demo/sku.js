// SKU estable del catálogo demo a partir del id (#148 §6): el mismo criterio
// que usa el inventario serializado, para que el escáner del POS encuentre el
// producto aunque el seed no traiga SKU propio. Sin dependencias: testeable.
export function skuDemo(id) {
  return String(id || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 24)
}
