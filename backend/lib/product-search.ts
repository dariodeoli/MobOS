// Búsqueda de productos para el POS (#157): normalización del código del
// escáner, clasificación de la coincidencia y resumen de disponibilidad por
// sucursal. Funciones puras: la consulta vive en la ruta y esto se testea solo.

import { serialKey } from './validation'

export type Coincidencia = 'serial' | 'sku' | 'nombre' | 'modelo' | 'capacidad' | 'texto'

export type DisponibilidadSucursal = { branchId: string | null; branchName: string | null; available: number }

/** El escáner manda `MOBOS:<serial>`, el serial pelado, un SKU o texto. */
export const normalizarBusqueda = (valor: unknown) => serialKey(valor)

/** Cómo coincidió el producto, para que el POS lo explique en el resultado. */
export function clasificarCoincidencia(producto: { sku?: string | null; name?: string | null; model?: string | null; capacity?: string | null; color?: string | null }, consulta: string, porSerial = false): Coincidencia {
  if (porSerial) return 'serial'
  const codigo = normalizarBusqueda(consulta)
  const texto = String(consulta || '').trim().toLowerCase()
  if (producto.sku && normalizarBusqueda(producto.sku) === codigo) return 'sku'
  if (String(producto.name || '').toLowerCase() === texto) return 'nombre'
  const contiene = (valor?: string | null) => Boolean(valor) && String(valor).toLowerCase().includes(texto)
  if (contiene(producto.model)) return 'modelo'
  if (contiene(producto.capacity)) return 'capacidad'
  if (contiene(producto.color)) return 'texto'
  return 'texto'
}

/**
 * Disponibilidad del producto en la sucursal pedida y en las demás.
 * Con unidades (modelos con IMEI) manda el conteo real de unidades disponibles
 * o reservadas por sucursal; sin unidades, vale el contador del producto en su
 * propia sucursal (o en todas cuando el producto es general).
 */
export function resumirDisponibilidad(input: {
  branchId: string | null
  productBranchId: string | null
  stockContador: number
  unidades: Array<{ branchId: string | null; available: number }>
  nombresSucursal?: Map<string, string>
}): { stock: number; disponible: boolean; agotado: boolean; disponibleEn: DisponibilidadSucursal[] } {
  const { branchId, productBranchId, stockContador, unidades, nombresSucursal } = input
  const conUnidades = unidades.length > 0
  const porSucursal = conUnidades
    ? unidades
    : stockContador > 0
      ? [{ branchId: productBranchId, available: stockContador }]
      : []
  const disponibleEn = porSucursal
    .filter(item => item.available > 0)
    .map(item => ({ branchId: item.branchId, branchName: item.branchId ? nombresSucursal?.get(item.branchId) || null : null, available: item.available }))
    .sort((a, b) => b.available - a.available)
  const stock = conUnidades
    ? unidades.filter(item => item.branchId === branchId).reduce((suma, item) => suma + item.available, 0)
    : productBranchId === null || productBranchId === branchId ? stockContador : 0
  return { stock, disponible: stock > 0, agotado: stock <= 0, disponibleEn }
}

/** El POS lista primero la coincidencia de código y después el texto. */
export function ordenarResultados<T extends { coincidencia: Coincidencia; name?: string | null }>(filas: T[]): T[] {
  const peso: Record<Coincidencia, number> = { serial: 0, sku: 1, nombre: 2, modelo: 3, capacidad: 4, texto: 5 }
  return [...filas].sort((a, b) => peso[a.coincidencia] - peso[b.coincidencia] || String(a.name || '').localeCompare(String(b.name || ''), 'es'))
}
