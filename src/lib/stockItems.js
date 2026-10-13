// Lista unificada de Stock (U3): helpers puros del contrato de
// GET /api/stock/items. Sin React ni red, para probarlos con node:test.
//
// Una fila es una unidad serializada (`kind: 'unit'`, un IMEI) o un producto sin
// unidades (`kind: 'product'`, un accesorio con `quantity`). El costo y el
// proveedor llegan en `null` para los roles sin permiso: la pantalla oculta esas
// columnas, nunca inventa un valor.

export const ESTADOS_STOCK = Object.freeze([
  ['disponible', 'Disponible', 'ok'],
  ['reservado', 'Reservado', 'pass'],
  ['vendido', 'Vendido', 'bad'],
  ['defectuoso', 'Defectuoso', 'warn'],
  ['en_transito', 'En tránsito', 'info'],
])

export const TIPOS_STOCK = Object.freeze([
  ['EQUIPO', 'Equipos'],
  ['ACCESORIO', 'Accesorios'],
  ['REPUESTO', 'Repuestos'],
  ['OTRO', 'Otros'],
])

const ESTADO_EXTRA = { eliminado: ['Eliminado', 'mute'] }

// Estado de la API → estado de la unidad en los recursos de inventario (los
// diálogos de baja, revisión y reserva siguen hablando ese idioma).
export const ESTADO_UNIDAD_DE_STOCK = Object.freeze({
  disponible: 'AVAILABLE',
  reservado: 'RESERVED',
  vendido: 'SOLD',
  defectuoso: 'DEFECTIVE',
  en_transito: 'IN_TRANSIT',
  eliminado: 'AVAILABLE',
})

export const etiquetaEstadoStock = (estado) => ESTADOS_STOCK.find(([clave]) => clave === estado)?.[1] || ESTADO_EXTRA[estado]?.[0] || String(estado || '—')
export const tonoEstadoStock = (estado) => ESTADOS_STOCK.find(([clave]) => clave === estado)?.[2] || ESTADO_EXTRA[estado]?.[1] || 'mute'

/** Miles con punto, sin depender del locale del navegador («1.234»). */
export const miles = (valor) => {
  const numero = Math.trunc(Number(valor))
  if (!Number.isFinite(numero)) return '0'
  return String(Math.abs(numero)).replace(/\B(?=(\d{3})+(?!\d))/g, '.').replace(/^/, numero < 0 ? '-' : '')
}

/** «Mostrando 50 de 1.234». */
export const textoMostrandoStock = (mostrados, total) => `Mostrando ${miles(mostrados)} de ${miles(Math.max(Number(total) || 0, Number(mostrados) || 0))}`

/** Estado visible de la fila: los accesorios dicen «12 disponibles», las unidades su estado. */
export function textoEstadoItem(item) {
  if (!item) return '—'
  if (item.kind === 'product') {
    const cantidad = Number(item.quantity) || 0
    if (item.status === 'vendido') return `${miles(cantidad)} ${cantidad === 1 ? 'vendido' : 'vendidos'}`
    return `${miles(cantidad)} ${cantidad === 1 ? 'disponible' : 'disponibles'}`
  }
  return etiquetaEstadoStock(item.status)
}

/** Modelo para mostrar: nombre del producto y, aparte, su variante si aporta algo. */
export function modeloDeItem(item) {
  const nombre = String(item?.name || '').trim()
  const variante = String(item?.model || '').trim()
  const bajo = (texto) => texto.toLowerCase()
  if (!variante || !nombre || bajo(nombre).includes(bajo(variante))) return { nombre: nombre || variante || 'Producto', variante: '' }
  // «iPhone 15 128GB Negro» sobre el nombre «iPhone 15»: solo se agrega lo que falta.
  const resto = bajo(variante).startsWith(bajo(nombre)) ? variante.slice(nombre.length).trim() : variante
  return { nombre, variante: resto }
}

/** IMEI/serie de la unidad o SKU del accesorio. */
export const identificadorDeItem = (item) => (item?.kind === 'product' ? item?.sku || '' : item?.serial || '')

/**
 * Unidad con la forma que usan los diálogos y acciones del inventario
 * (verificar, reservar, vender, dar de baja…) armada desde una fila de la lista.
 * El precio sale del catálogo local: la lista no trae precios de venta.
 */
export function unidadDeItem(item, productos = []) {
  if (!item) return null
  const catalogo = (Array.isArray(productos) ? productos : []).find((fila) => fila?.id === item.productId)
  const precio = Number(catalogo?.precioVenta ?? catalogo?.pricePyg ?? 0) || 0
  const { nombre, variante } = modeloDeItem(item)
  return {
    id: item.id,
    serial: item.serial || '',
    status: ESTADO_UNIDAD_DE_STOCK[item.status] || 'AVAILABLE',
    productId: item.productId,
    branchId: item.branchId || null,
    locationId: item.locationId || null,
    batteryHealth: item.batteryHealth ?? null,
    supplierName: item.supplierName || '',
    costPyg: item.costPyg ?? null,
    createdAt: item.createdAt,
    product: { id: item.productId, name: nombre, model: variante || nombre, sku: item.sku || '', pricePyg: precio },
    branch: item.branchName ? { id: item.branchId, name: item.branchName } : null,
    location: item.locationName ? { id: item.locationId, name: item.locationName } : null,
    ...(item.status === 'vendido' ? { sale: { soldAt: item.soldAt || null } } : {}),
  }
}

/**
 * Filas que entiende `etiquetasDeFilasStock` (U4a): las unidades viajan con su
 * serial y los accesorios con SKU, nombre y precio de lista. Nunca el costo.
 */
export function filasEtiquetasDeItems(items = [], productos = []) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const { nombre, variante } = modeloDeItem(item)
    if (item.kind === 'unit' && item.serial) {
      return {
        serial: item.serial,
        batteryHealth: item.batteryHealth ?? undefined,
        supplierName: item.supplierName || undefined,
        location: item.locationName ? { name: item.locationName } : undefined,
        product: { name: nombre, model: variante || nombre },
      }
    }
    const catalogo = (Array.isArray(productos) ? productos : []).find((fila) => fila?.id === item.productId)
    return { sku: item.sku || '', name: nombre, pricePyg: Number(catalogo?.precioVenta ?? catalogo?.pricePyg ?? 0) || 0, copies: 1 }
  })
}

/** Querystring de GET /api/stock/items para unos filtros de pantalla. */
export function paramsStockItems({ tipo = '', estado = '', sucursal = '', proveedor = '', q = '', producto = '', desde = '', hasta = '' } = {}, { limit = 50, cursor = '' } = {}) {
  const params = new URLSearchParams()
  if (estado) params.set('status', estado)
  if (tipo) params.set('stockKind', tipo)
  if (sucursal) params.set('branchId', sucursal)
  if (proveedor) params.set('supplierId', proveedor)
  if (producto) params.set('productId', producto)
  if (q && String(q).trim()) params.set('q', String(q).trim())
  if (desde) params.set('from', desde)
  if (hasta) params.set('to', hasta)
  params.set('limit', String(limit))
  if (cursor) params.set('cursor', cursor)
  return params
}

/** El costo se muestra si el rol lo ve (o si la API ya devolvió alguno). */
export function columnaCostoVisible({ rolVeCosto = false, items = [] } = {}) {
  if (rolVeCosto) return true
  return (Array.isArray(items) ? items : []).some((item) => item?.costPyg !== null && item?.costPyg !== undefined)
}
