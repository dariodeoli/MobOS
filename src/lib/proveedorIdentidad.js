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
