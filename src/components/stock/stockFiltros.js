// Filtros de la lista de Stock (U3): viven en la URL (?tipo=&estado=&sucursal=
// &proveedor=…) para que se puedan compartir, recargar y volver con «Atrás».
// Funciones puras: sin React ni red.
import { ESTADOS_STOCK, TIPOS_STOCK } from '../../lib/stockItems.js'

const TIPOS = TIPOS_STOCK.map(([id]) => id)
const ESTADOS = ESTADOS_STOCK.map(([id]) => id)
const PERIODOS = ['hoy', 'ayer', 'rango']
const CLAVES_FILTRO = ['tipo', 'estado', 'sucursal', 'proveedor']

/** Valor de ?sucursal= que pide ver todas las sucursales (sin él, Unidades arranca en la activa, #466). */
export const SUCURSAL_TODAS = 'todas'

const id = (valor) => String(valor || '').trim().slice(0, 128)
const fechaDia = (valor) => (/^\d{4}-\d{2}-\d{2}$/.test(String(valor || '')) ? String(valor) : '')

/** Filtros válidos de la URL; un valor desconocido se ignora, nunca se manda a la API. */
export function leerFiltrosStock(searchParams) {
  const leer = (clave) => searchParams.get(clave) || ''
  const tipo = leer('tipo').toUpperCase()
  const estado = leer('estado')
  const periodo = leer('periodo')
  return {
    tipo: TIPOS.includes(tipo) ? tipo : '',
    estado: ESTADOS.includes(estado) ? estado : '',
    sucursal: id(leer('sucursal')),
    proveedor: id(leer('proveedor')),
    producto: id(leer('producto')),
    periodo: PERIODOS.includes(periodo) ? periodo : '',
    desde: fechaDia(leer('desde')),
    hasta: fechaDia(leer('hasta')),
  }
}

/** Copia de los parámetros con los cambios aplicados; un valor vacío quita la clave. */
export function conFiltroStock(searchParams, cambios = {}) {
  const siguiente = new URLSearchParams(searchParams)
  for (const [clave, valor] of Object.entries(cambios)) {
    if (valor === '' || valor === null || valor === undefined) siguiente.delete(clave)
    else siguiente.set(clave, String(valor))
  }
  return siguiente
}

/** Hay algún chip activo (tipo, estado, sucursal o proveedor). */
export const hayFiltrosStock = (filtros) => CLAVES_FILTRO.some((clave) => (clave === 'sucursal' && filtros?.sucursalPorDefecto ? false : Boolean(filtros?.[clave])))

/**
 * Filtros efectivos de Unidades (#466): la sucursal de la URL manda; `todas` muestra todas; sin nada
 * se usa la sucursal activa del selector (solo si la empresa tiene más de una y no hay un producto acotado).
 */
export function conSucursalActiva(filtros, { aplica = false, sucursalActivaId = '' } = {}) {
  if (filtros.sucursal === SUCURSAL_TODAS) return { ...filtros, sucursal: '', sucursalPorDefecto: false }
  if (filtros.sucursal) return { ...filtros, sucursalPorDefecto: false }
  if (aplica && sucursalActivaId && !filtros.producto) return { ...filtros, sucursal: sucursalActivaId, sucursalPorDefecto: true }
  return { ...filtros, sucursalPorDefecto: false }
}

/** Quita los chips (la búsqueda y el producto que acota la vista se conservan). */
export function sinFiltrosStock(searchParams) {
  return conFiltroStock(searchParams, Object.fromEntries([...CLAVES_FILTRO, 'periodo', 'desde', 'hasta'].map((clave) => [clave, ''])))
}

const inicioDelDia = (fecha) => new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 0, 0, 0, 0)
const finDelDia = (fecha) => new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 23, 59, 59, 999)
const diaLocal = (texto) => {
  const [anio, mes, dia] = String(texto).split('-').map(Number)
  return new Date(anio, mes - 1, dia)
}

/**
 * Rango [desde, hasta] (ISO) del período de Vendidos con los límites del día
 * local, para que «hoy» sea el día de la tienda y no el de UTC.
 */
export function rangoDePeriodo({ periodo = '', desde = '', hasta = '' } = {}, ahora = new Date()) {
  if (periodo === 'hoy') return { desde: inicioDelDia(ahora).toISOString(), hasta: finDelDia(ahora).toISOString() }
  if (periodo === 'ayer') {
    const ayer = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 1)
    return { desde: inicioDelDia(ayer).toISOString(), hasta: finDelDia(ayer).toISOString() }
  }
  if (periodo === 'rango') {
    return {
      desde: desde ? inicioDelDia(diaLocal(desde)).toISOString() : '',
      hasta: hasta ? finDelDia(diaLocal(hasta)).toISOString() : '',
    }
  }
  return { desde: '', hasta: '' }
}
