// Adaptador demo de GET /api/stock/items (U3): arma la misma respuesta
// `{ items, nextCursor, hasMore, limit, totals }` desde el inventario demo
// session-only, para que el demo muestre la lista unificada sin tocar la red.
import { costoEnGs } from '../../utils/inventario.js'

const LIMITE_DEFECTO = 50
const LIMITE_MAXIMO = 200
const ESTADO_DE_UNIDAD = { AVAILABLE: 'disponible', RESERVED: 'reservado', SOLD: 'vendido', DEFECTIVE: 'defectuoso', IN_TRANSIT: 'en_transito' }

const sinAcentos = (texto) => String(texto ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Mismo criterio que el clasificador del backend (stock-kind.ts), reducido a lo
// que trae el catálogo demo.
export function tipoDeCategoria(categoria) {
  const texto = sinAcentos(categoria)
  if (/soporte tecnico|servicio/.test(texto)) return 'OTRO'
  if (/accesorio|cable|cargador|funda|vidrio|lamina|templado|adaptador|protector|soporte|audio|parlante|auricular|audifono/.test(texto)) return 'ACCESORIO'
  if (/repuesto|pieza|pantalla|display|modulo|bateria/.test(texto)) return 'REPUESTO'
  if (/iphone|celular|telefono|smartphone|mac|ipad|tablet|watch|reloj|airpods/.test(texto)) return 'EQUIPO'
  return 'OTRO'
}

function itemDeUnidad(unit, eliminada) {
  const producto = unit.product || {}
  const nombre = String(producto.name || producto.nombre || '').trim()
  const capacidad = String(producto.capacity || '').trim()
  const variante = capacidad && !sinAcentos(nombre).includes(sinAcentos(capacidad)) ? `${nombre} ${capacidad}` : nombre
  return {
    id: unit.id,
    kind: 'unit',
    stockKind: 'EQUIPO',
    productId: unit.productId || producto.id || '',
    sku: producto.sku || '',
    model: variante,
    name: nombre,
    serial: unit.serial || null,
    condition: unit.condition || null,
    batteryHealth: unit.batteryHealth ?? null,
    supplierId: unit.supplier?.id || null,
    supplierName: unit.supplierName || unit.supplier?.name || null,
    consignorName: unit.consignorName || null,
    costPyg: costoEnGs(unit),
    status: eliminada ? 'eliminado' : ESTADO_DE_UNIDAD[unit.status] || 'en_transito',
    quantity: 1,
    branchId: unit.branchId || null,
    branchName: unit.branch?.name || null,
    locationId: unit.locationId || null,
    locationName: unit.location?.name || null,
    createdAt: unit.createdAt || null,
    soldAt: unit.soldAt || (unit.status === 'SOLD' ? unit.updatedAt || unit.createdAt || null : null),
  }
}

function itemDeProducto(producto, sucursales) {
  const stock = Math.max(0, Number(producto.stock) || 0)
  const branchId = producto.branchId || null
  return {
    id: producto.id,
    kind: 'product',
    stockKind: tipoDeCategoria(producto.categoria),
    productId: producto.id,
    sku: producto.sku || '',
    model: '',
    name: String(producto.nombre || producto.name || '').trim(),
    serial: null,
    condition: null,
    batteryHealth: null,
    supplierId: null,
    supplierName: null,
    consignorName: null,
    costPyg: Number(producto.precioCosto) > 0 ? Number(producto.precioCosto) : null,
    status: 'disponible',
    quantity: stock,
    branchId,
    branchName: sucursales.find((sucursal) => sucursal.id === branchId)?.name || null,
    locationId: null,
    locationName: null,
    createdAt: producto.createdAt || null,
    soldAt: null,
  }
}

const coincideTexto = (item, q) => {
  const buscar = sinAcentos(q).trim()
  if (!buscar) return true
  return [item.serial, item.sku, item.name, item.model].some((valor) => sinAcentos(valor).includes(buscar))
}

const tiempo = (valor) => {
  const fecha = new Date(valor || 0).getTime()
  return Number.isFinite(fecha) ? fecha : 0
}

const codificarCursor = (desplazamiento) => `demo:${desplazamiento}`
const leerCursor = (cursor) => {
  const m = /^demo:(\d+)$/.exec(String(cursor || ''))
  return m ? Number(m[1]) : 0
}

/**
 * @param {URLSearchParams|object} consulta mismos parámetros que la API real
 * @param {{ units: object[], removed: object[], products: object[], branches: object[] }} fuente
 */
export function listarStockItemsDemo(consulta, { units = [], removed = [], products = [], branches = [] } = {}) {
  const params = consulta instanceof URLSearchParams ? consulta : new URLSearchParams(Object.entries(consulta || {}).filter(([, valor]) => valor !== undefined && valor !== null && valor !== ''))
  const estado = params.get('status') || ''
  const tipo = (params.get('stockKind') || '').toUpperCase()
  const filaTipo = params.get('kind') || ''
  const sucursal = params.get('branchId') || ''
  const proveedor = params.get('supplierId') || ''
  const productoId = params.get('productId') || ''
  const q = params.get('q') || ''
  const desde = params.get('from') ? tiempo(params.get('from')) : null
  // Igual que la API: una fecha sola incluye todo ese día; un instante, hasta ese instante.
  const hastaTexto = params.get('to') || ''
  const hasta = hastaTexto ? tiempo(hastaTexto) + (/^\d{4}-\d{2}-\d{2}$/.test(hastaTexto) ? 86400000 : 1) : null
  const pedido = Number(params.get('limit'))
  const limit = Number.isFinite(pedido) && pedido >= 1 ? Math.min(LIMITE_MAXIMO, Math.floor(pedido)) : LIMITE_DEFECTO

  const conUnidades = new Set([...units, ...removed].map((unit) => unit.productId))
  let filas = []
  if (estado === 'eliminado') filas = removed.map((unit) => itemDeUnidad(unit, true))
  else {
    filas = units.map((unit) => itemDeUnidad(unit, false))
    if (!estado || estado === 'disponible') {
      filas = filas.concat(
        products
          .filter((producto) => producto?.activo !== false && !conUnidades.has(producto.id) && tipoDeCategoria(producto.categoria) !== 'EQUIPO')
          .map((producto) => itemDeProducto(producto, branches)),
      )
    }
  }
  filas = filas.filter((item) => {
    if (estado && estado !== 'eliminado' && item.status !== estado) return false
    if (tipo && item.stockKind !== tipo) return false
    if (filaTipo && item.kind !== filaTipo) return false
    if (sucursal && item.branchId !== sucursal) return false
    if (proveedor && item.supplierId !== proveedor) return false
    if (productoId && item.productId !== productoId) return false
    if (!coincideTexto(item, q)) return false
    const clave = tiempo(estado === 'vendido' ? item.soldAt || item.createdAt : item.createdAt)
    if (desde !== null && clave < desde) return false
    if (hasta !== null && clave >= hasta) return false
    return true
  })
  const clave = (item) => tiempo(estado === 'vendido' ? item.soldAt || item.createdAt : item.createdAt)
  filas.sort((a, b) => clave(b) - clave(a) || String(b.id).localeCompare(String(a.id)))

  const totals = { total: filas.length, byStatus: {}, byKind: {}, byRowKind: {} }
  for (const item of filas) {
    totals.byStatus[item.status] = (totals.byStatus[item.status] || 0) + 1
    totals.byKind[item.stockKind] = (totals.byKind[item.stockKind] || 0) + 1
    totals.byRowKind[item.kind] = (totals.byRowKind[item.kind] || 0) + 1
  }
  const inicio = leerCursor(params.get('cursor'))
  const pagina = filas.slice(inicio, inicio + limit)
  const hasMore = inicio + limit < filas.length
  return { items: pagina, nextCursor: hasMore ? codificarCursor(inicio + limit) : null, hasMore, limit, totals }
}
