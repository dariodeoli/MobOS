// Identidad visual del proveedor (#400): ícono de un set fijo, color y cómo se
// muestra («Abreviado» por defecto o «Completo»). La API guarda el ícono en
// mayúsculas (`STORE`) y el color como #rrggbb; acá se traduce al set de Icon.

export const ICONOS_PROVEEDOR = ['STORE', 'TRUCK', 'GLOBE', 'BUILDING', 'PACKAGE', 'BANK', 'PHONE', 'BOX']

export const COLORES_PROVEEDOR = ['#2563eb', '#7c3aed', '#0d9488', '#c2410c', '#be185d', '#4d7c0f', '#0369a1', '#a16207']

export const MODOS_PROVEEDOR = [['ABREVIADO', 'Abreviado'], ['COMPLETO', 'Completo']]

/** Nombre de `Icon` para el ícono guardado, o '' si no es del set. */
export function iconoProveedor(valor) {
  const clave = String(valor || '').trim().toUpperCase()
  return ICONOS_PROVEEDOR.includes(clave) ? clave.toLowerCase() : ''
}

/**
 * Lo que la ficha de unidad muestra del proveedor. El nombre real solo llega
 * a la pantalla si `veNombre` (administración/gerencia); para el resto sale la
 * sigla, o «S/S» si el proveedor no tiene — nunca `supplierName` ni `supplier.name`.
 */
export function proveedorParaFicha(unit = {}, veNombre = false) {
  const relacion = unit?.supplier || null
  const nombre = veNombre ? String(relacion?.name || unit?.supplierName || '') : ''
  const sigla = String(relacion?.code || '').trim() || (!veNombre && (relacion || unit?.supplierName) ? 'S/S' : '')
  return { sigla, nombre, completo: Boolean(nombre) && relacion?.displayMode === 'COMPLETO' }
}
