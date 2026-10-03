// #331: bandeja de autorizaciones de stock dentro de Inventario.
//
// Solo entran los tipos operativos del dominio: retiro/ajuste de unidad
// (STOCK_ADJUST) y transferencia entre sucursales (TRANSFER). La resolución
// reusa /api/authorizations y NO cambia la semántica: una aprobada sigue
// consumiéndose al ejecutarse desde UnidadDetalle (o desde el flujo de
// transferencias) una sola vez.
import { nombreProducto } from '../utils/inventario.js'

export const KINDS_AUTORIZACION_STOCK = ['STOCK_ADJUST', 'TRANSFER']

export const ETIQUETA_KIND_STOCK = {
  STOCK_ADJUST: 'Retiro / ajuste',
  TRANSFER: 'Transferencia',
}

export const ETIQUETA_ACCION_STOCK = {
  remove: 'Dar de baja',
  adjust: 'Ajustar / revisar',
  restore: 'Restaurar',
}

export function esAutorizacionStock(row) {
  return KINDS_AUTORIZACION_STOCK.includes(row?.kind)
}

// Pendientes y resueltas por separado: la bandeja decide primero y deja el
// historial corto después (el mismo criterio que la bandeja general).
export function partirAutorizacionesStock(rows = []) {
  const stock = (Array.isArray(rows) ? rows : []).filter(esAutorizacionStock)
  return {
    pendientes: stock.filter((row) => row.status === 'PENDING'),
    resueltas: stock.filter((row) => row.status !== 'PENDING'),
  }
}

const valorDe = (row) => (row?.requestedValue && typeof row.requestedValue === 'object' ? row.requestedValue : {})
const sufijo = (id) => String(id || '').slice(-6)

// Sujeto afectado ya resuelto para mostrar: unidad + IMEI en retiro/ajuste;
// producto + ruta + cantidad en transferencia. Si la unidad no está en la
// lista cargada (p. ej. ya salió de stock), cae al id corto sin inventar datos.
export function sujetoDeSolicitudStock(row, { unidades = [], productos = [], sucursales = [] } = {}) {
  const valor = valorDe(row)
  if (row?.kind === 'STOCK_ADJUST') {
    const unidad = (unidades || []).find((item) => item.id === valor.unitId) || null
    const producto = unidad?.product || (productos || []).find((item) => item.id === unidad?.productId) || null
    return {
      titulo: producto ? nombreProducto(producto) : `Unidad ${sufijo(valor.unitId) || 'sin identificar'}`,
      serial: String(unidad?.serial || ''),
      accion: ETIQUETA_ACCION_STOCK[valor.action] || 'Retiro o ajuste',
      detalle: [unidad?.branch?.name, unidad?.location?.name].filter(Boolean).join(' · '),
    }
  }
  const producto = (productos || []).find((item) => item.id === valor.productId) || null
  const nombreRama = (id) => (sucursales || []).find((item) => item.id === id)?.name || (id ? `Sucursal ${sufijo(id)}` : '')
  const cantidad = Number(valor.quantity || 0)
  return {
    titulo: producto ? nombreProducto(producto) : `Producto ${sufijo(valor.productId) || 'sin identificar'}`,
    serial: Array.isArray(valor.serials) ? valor.serials.join(', ') : '',
    accion: 'Transferencia',
    detalle: [
      [nombreRama(valor.sourceBranchId), nombreRama(valor.destinationBranchId)].filter(Boolean).join(' → '),
      cantidad > 0 ? `${cantidad} unidad${cantidad === 1 ? '' : 'es'}` : '',
    ].filter(Boolean).join(' · '),
  }
}

// El motivo del pedido vive en requestedValue.reason; la nota general es el
// respaldo de los tipos que no lo mandan (transferencias).
export function motivoDeSolicitudStock(row) {
  return String(valorDe(row).reason || row?.note || '').trim()
}

// Antigüedad legible de la bandeja: solo la hora si es de hoy; si no, día y
// mes cortos con la hora. Mismo formato que la cronología de la ficha.
export function antiguedad(value) {
  const fecha = value ? new Date(value) : null
  if (!fecha || Number.isNaN(fecha.getTime())) return '—'
  const hora = fecha.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (fecha.toDateString() === new Date().toDateString()) return hora
  return `${fecha.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' })} ${hora}`
}

const HORA = 3600000
const hace = (ms) => new Date(Date.now() - ms).toISOString()

// Muestra de la demo: mismas filas que devuelve el API (pendientes + resueltas)
// para que la bandeja se vea completa sin tocar el servidor.
export const DEMO_AUTORIZACIONES_STOCK = [
  {
    id: 'demo-autz-stock-retiro',
    status: 'PENDING',
    kind: 'STOCK_ADJUST',
    entity: 'INVENTORY_UNIT',
    entityId: 'demo-unit-4',
    requestedValue: { unitId: 'demo-unit-4', action: 'remove', reason: 'Detalle en la carcasa: sale de stock para revisión del taller.' },
    requestedById: 'demo-user-vendedor',
    requestedBy: { id: 'demo-user-vendedor', name: 'Diego López' },
    createdAt: hace(2 * HORA),
  },
  {
    id: 'demo-autz-stock-transferencia',
    status: 'PENDING',
    kind: 'TRANSFER',
    entity: 'STOCK_TRANSFER',
    entityId: 'demo-iphone-15-128-azul',
    requestedValue: { sourceBranchId: 'mobos-demo-central', destinationBranchId: 'mobos-demo-villa-morra', productId: 'demo-iphone-15-128-azul', quantity: 2, serials: [] },
    requestedById: 'demo-user-gerente',
    requestedBy: { id: 'demo-user-gerente', name: 'Ana Giménez' },
    createdAt: hace(26 * HORA),
  },
  {
    id: 'demo-autz-stock-aprobada',
    status: 'APPROVED',
    kind: 'STOCK_ADJUST',
    entity: 'INVENTORY_UNIT',
    entityId: 'demo-unit-22',
    requestedValue: { unitId: 'demo-unit-22', action: 'adjust', reason: 'Batería hinchada: pasa a revisión.' },
    resolvedValue: { approved: true },
    requestedById: 'demo-user-vendedor',
    requestedBy: { id: 'demo-user-vendedor', name: 'Diego López' },
    createdAt: hace(30 * HORA),
    resolvedBy: { id: 'demo-user', name: 'Hernán Acosta' },
    resolvedAt: hace(28 * HORA),
    resolvedNote: 'Aprobado: que pase a revisión.',
  },
]

export function demoAutorizacionesStock() {
  return DEMO_AUTORIZACIONES_STOCK.map((row) => ({ ...row }))
}
