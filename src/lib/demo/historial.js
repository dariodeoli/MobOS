// Cronologías ficticias del modo demo (#324): historial de integrantes,
// proveedores, compras y cotizaciones armado con los MISMOS datos de los
// fixtures (equipo, proveedores, compras). Así los modales de «Historial» no
// piden al API real (que en demo responde DEMO_MODE) y nunca se contradicen.
import { EQUIPO_DEMO } from './iphones.js'
import { DEMO_PURCHASES } from './compras.js'
import { listDemoSuppliers } from '../demoInventory.js'
import { formatGs } from '../../utils/moneda.js'

const hace = (dias, hora = 10) => new Date(Date.now() - dias * 86400000 + hora * 3600000).toISOString()
const usuario = (nombre) => ({ id: 'demo-user', name: nombre })
const evento = (id, type, action, createdAt, { detalle = '', quien = 'Sistema' } = {}) => ({
  id,
  type,
  action,
  label: action,
  createdAt,
  user: quien === 'Sistema' ? null : usuario(quien),
  detail: detalle,
})

// ── Integrantes del equipo ──────────────────────────────────────────
const ACCIONES_POR_ROL = {
  ADMIN: ['Configuración de la tienda actualizada', 'Cierre de caja verificado'],
  GERENTE: ['Descuento autorizado', 'Meta del equipo actualizada'],
  VENDEDOR: ['Venta registrada', 'Cliente asignado para seguimiento'],
  CAJERA: ['Cobro confirmado', 'Arqueo de caja registrado'],
  TECNICO: ['Orden de servicio actualizada', 'Diagnóstico firmado'],
  REPARTIDOR: ['Reparto asignado', 'Rendición entregada'],
}

function historialIntegrante(id, { ventas = [] } = {}) {
  const persona = EQUIPO_DEMO.find((row) => row.id === id)
  if (!persona) return null
  const acciones = ACCIONES_POR_ROL[persona.rol] || ACCIONES_POR_ROL.VENDEDOR
  const jefe = EQUIPO_DEMO[0]
  const eventos = [
    evento(`demo-hist-${persona.id}-1`, 'user', 'Alta en el equipo', hace(180, 9), { detalle: `Rol ${persona.rol} · acceso habilitado`, quien: jefe.nombre }),
    evento(`demo-hist-${persona.id}-2`, 'audit', 'PIN de acceso actualizado', hace(120, 14), { detalle: 'Cambio de credencial ficticia', quien: jefe.nombre }),
    evento(`demo-hist-${persona.id}-3`, 'sale', acciones[0], hace(30, 11), { detalle: `Operación de ${persona.nombre} en Casa Central`, quien: persona.nombre }),
    evento(`demo-hist-${persona.id}-4`, 'user', acciones[1], hace(7, 16), { detalle: 'Actividad de la última semana', quien: persona.nombre }),
  ]
  // Ventas reales de la demo del vendedor, con su pedido y cobros registrados.
  const propias = ventas.filter((venta) => venta.vendedorId === persona.id || venta.seller?.id === persona.id)
  for (const venta of propias) {
    const cuando = venta.creadoEn || venta.createdAt || venta.fecha
    if (!cuando || venta.status === 'CANCELLED') continue
    const numero = venta.orderNumber || venta.numero || venta.id
    eventos.push({ ...evento(`demo-hist-${persona.id}-v-${venta.id}`, 'sale', 'Venta', cuando, { detalle: `${numero} · ${formatGs(venta.total ?? venta.precio ?? 0)}`, quien: persona.nombre }), ref: { kind: 'order', id: venta.id } })
  }
  const total = propias.reduce((suma, venta) => suma + Number(venta.total ?? venta.precio ?? 0), 0)
  const pct = persona.rol === 'VENDEDOR' ? 0.06 : persona.rol === 'GERENTE' ? 0.03 : 0
  const margen = propias.reduce((suma, venta) => suma + Math.max(0, Number(venta.precio || 0) - Number(venta.precioCosto || 0)), 0)
  const comision = Math.round(margen * pct)
  if (comision > 0) eventos.push(evento(`demo-hist-${persona.id}-comision`, 'payment', 'Comisión liquidada', hace(3, 10), { detalle: `Período anterior · ${formatGs(Math.round(comision * 0.6))}`, quien: jefe.nombre }))
  return {
    events: eventos,
    summary: { ventas: propias.length, ventasPyg: total, cobros: persona.rol === 'CAJERA' ? Math.max(propias.length, 1) : 0, cobrosPyg: persona.rol === 'CAJERA' ? total : 0, comisionPagadaPyg: Math.round(comision * 0.6), comisionPendientePyg: Math.round(comision * 0.4) },
  }
}

// ── Proveedores y compras ───────────────────────────────────────────
function historialProveedor(id, { compras = DEMO_PURCHASES } = {}) {
  const proveedor = listDemoSuppliers().find((row) => row.id === id)
  if (!proveedor) return null
  const eventos = []
  const propias = (compras || []).filter((row) => row.supplierId === proveedor.id)
  const productos = new Map()
  let comprado = 0
  let pagado = 0
  let indice = 0
  for (const compra of propias) {
    const total = Number(compra.finalCostPyg || 0)
    comprado += total
    pagado += Number(compra.paidPyg || 0)
    eventos.push({ ...evento(`demo-hist-prov-${proveedor.id}-c${indice}`, 'purchase', 'Compra registrada', compra.createdAt, { detalle: `${compra.supplierReference || compra.id} · ${formatGs(total)} · ${compra.lines?.length || 0} línea(s)`, quien: 'Equipo demo' }), ref: { kind: 'purchase', id: compra.id } })
    if (compra.receivedAt) eventos.push(evento(`demo-hist-prov-${proveedor.id}-r${indice}`, 'purchase', 'Mercadería recibida', compra.receivedAt, { detalle: 'Ingresó al stock de Casa Central', quien: 'María Benítez' }))
    if (Number(compra.paidPyg) > 0) eventos.push(evento(`demo-hist-prov-${proveedor.id}-p${indice}`, 'payment', 'Pago a proveedor', compra.receivedAt || compra.createdAt, { detalle: `${formatGs(compra.paidPyg)} · ${compra.supplierReference || compra.id}`, quien: 'María Benítez' }))
    for (const linea of compra.lines || []) {
      const actual = productos.get(linea.productId) || { productId: linea.productId, name: linea.productName, sku: '', quantity: 0, totalPyg: 0, lastPurchasedAt: compra.createdAt }
      actual.quantity += Number(linea.quantity) || 0
      actual.totalPyg += Number(linea.finalTotalCostPyg) || 0
      productos.set(linea.productId, actual)
    }
    indice += 1
  }
  if (!eventos.length) eventos.push(evento(`demo-hist-prov-${proveedor.id}-0`, 'user', 'Proveedor registrado', hace(60, 9), { detalle: proveedor.code ? `Abreviatura ${proveedor.code}` : '', quien: 'Equipo demo' }))
  const pendiente = propias.reduce((suma, compra) => suma + Math.max(0, Number(compra.outstandingPyg || 0)), 0)
  return {
    events: eventos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    summary: { totalPurchasedPyg: comprado, paidPyg: pagado, returnedPyg: 0, outstandingPyg: pendiente, products: [...productos.values()].sort((a, b) => b.totalPyg - a.totalPyg) },
  }
}

function historialCompra(id) {
  const compra = DEMO_PURCHASES.find((row) => row.id === id)
  if (!compra) return null
  const eventos = [evento(`demo-hist-${compra.id}-c`, 'purchase', 'Compra creada', compra.createdAt, { detalle: `${compra.status === 'DRAFT' ? 'Borrador' : 'Orden'} · ${compra.lines?.length || 0} línea(s)`, quien: 'Equipo demo' })]
  if (compra.receivedAt) {
    const unidades = (compra.lines || []).reduce((suma, item) => suma + Number(item.receivedQty ?? item.quantity ?? 0), 0)
    eventos.push(evento(`demo-hist-${compra.id}-r`, 'purchase', 'Recepción completa', compra.receivedAt, { detalle: `${unidades} unidad(es) al stock · costo final ${formatGs(compra.finalCostPyg || 0)}`, quien: 'María Benítez' }))
  } else {
    eventos.push(evento(`demo-hist-${compra.id}-p`, 'purchase', 'Pendiente de recepción', compra.createdAt, { detalle: 'El borrador sigue abierto', quien: 'Equipo demo' }))
  }
  return eventos
}

function historialCotizacion(id) {
  return [
    evento(`demo-hist-${id}-1`, 'quote', 'Cotización creada', hace(12, 9), { detalle: 'Propuesta enviada al cliente', quien: 'Diego López' }),
    evento(`demo-hist-${id}-2`, 'quote', 'Cotización compartida', hace(10, 15), { detalle: 'Enlace público recordado por WhatsApp', quien: 'Diego López' }),
  ]
}

/**
 * Historial demo para un endpoint de cronología. Devuelve `{ events }` para los
 * recursos de la demo y `{ events: [] }` para el resto (nunca pega al API).
 */
export function historialDemo(endpoint, fuentes = {}) {
  const ruta = String(endpoint || '')
  const usuarioId = ruta.match(/^\/api\/users\/([^/]+)\/history$/)
  if (usuarioId) return historialIntegrante(decodeURIComponent(usuarioId[1]), fuentes) || { events: [] }
  const proveedorId = ruta.match(/^\/api\/suppliers\/([^/]+)\/history$/)
  if (proveedorId) return historialProveedor(decodeURIComponent(proveedorId[1]), fuentes) || { events: [] }
  const compraId = ruta.match(/^\/api\/purchases\/([^/]+)\/history$/)
  if (compraId) return { events: historialCompra(decodeURIComponent(compraId[1])) || [] }
  const cotizacionId = ruta.match(/^\/api\/quotes\/([^/]+)\/history$/)
  if (cotizacionId) return { events: historialCotizacion(decodeURIComponent(cotizacionId[1])) }
  return { events: [] }
}
