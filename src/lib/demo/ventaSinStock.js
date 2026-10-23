// Venta sin stock · demo funcional. Las ventas sin stock de ejemplo recorren el
// mismo camino que la app real (comprar → costo → pagado → recibido → avisar) con
// la misma forma de respuesta que `/api/supply/needs?detalle=1`, en el store de
// sesión de la demo (no se persiste entre sesiones ni toca datos reales).
import { guardarDemo, leerDemo } from '../demoStorage.js'
import { estadoSobrePedido, siguientePaso, ESTADO_LABEL } from '../ventaSinStock.js'

const KEY = 'mobos:demo-venta-sin-stock:v1'
const hace = (horas) => new Date(Date.now() - horas * 3600000).toISOString()
const enDias = (dias) => new Date(Date.now() + dias * 86400000).toISOString()

export const esNecesidadDemoSinStock = (id) => typeof id === 'string' && id.startsWith('demo-ss-') && !id.startsWith('demo-ss-compra-')
export const esCompraDemoSinStock = (id) => typeof id === 'string' && id.startsWith('demo-ss-compra-')

const seed = () => ({
  secuencia: 100,
  lineas: [
    { id: 'demo-ss-1', productoId: 'demo-funda-magsafe-transparente', producto: 'Funda MagSafe Transparente', condicion: 'NEW', cantidad: 2, pendientes: 2, recibidas: 0, conImei: false, prioridad: 'ALTA', prometidaEl: enDias(3), centro: 'LOCAL', sucursal: 'Casa Central', pedidoId: 'demo-ped-ss-1', pedidoNumero: 'AUR-0012', clienteId: 'demo-cliente-carlos', cliente: 'Carlos Ramírez', compra: null, llegoEl: null, avisadoEl: null, entregado: false },
    { id: 'demo-ss-2', productoId: 'demo-airpods-pro-2-usbc', producto: 'AirPods Pro 2 USB-C', condicion: 'NEW', cantidad: 1, pendientes: 1, recibidas: 0, conImei: false, prioridad: 'NORMAL', prometidaEl: enDias(5), centro: 'USA', sucursal: 'Casa Central', pedidoId: 'demo-ped-ss-2', pedidoNumero: 'AUR-0013', clienteId: 'demo-cliente-maria', cliente: 'María González',
      compra: { id: 'demo-ss-compra-1', code: 'CMP-AUR-0101', condicion: 'CONTADO', proveedor: 'Importadora Tech', costoUnitarioPyg: null, cantidad: 1, enCamino: false, paidAt: null, pagoSinCuenta: false }, llegoEl: null, avisadoEl: null, entregado: false },
    { id: 'demo-ss-3', productoId: 'demo-cargador-usbc-20w', producto: 'Cargador USB-C 20W', condicion: 'NEW', cantidad: 1, pendientes: 0, recibidas: 1, conImei: false, prioridad: 'NORMAL', prometidaEl: enDias(1), centro: 'CDE', sucursal: 'Casa Central', pedidoId: 'demo-ped-ss-3', pedidoNumero: 'AUR-0014', clienteId: 'demo-cliente-lucia', cliente: 'Lucía Benítez',
      compra: { id: 'demo-ss-compra-2', code: 'CMP-AUR-0102', condicion: 'CONTADO', proveedor: 'Distribuidora del Este', costoUnitarioPyg: 120000, cantidad: 1, enCamino: false, paidAt: hace(5), pagoSinCuenta: false }, llegoEl: hace(2), avisadoEl: null, entregado: false },
  ],
})

function leer() {
  try {
    const guardado = JSON.parse(leerDemo(KEY))
    if (guardado && Array.isArray(guardado.lineas)) return guardado
  } catch { /* se regenera */ }
  const nuevo = seed()
  guardarDemo(KEY, JSON.stringify(nuevo))
  return nuevo
}
const escribir = (estado) => { guardarDemo(KEY, JSON.stringify(estado)); return estado }

function aFila(linea) {
  const compra = linea.compra
  const compradas = compra ? Math.min(linea.cantidad, compra.cantidad) : 0
  const porComprar = Math.max(0, linea.cantidad - compradas)
  const faltaCosto = Boolean(compra) && (compra.costoUnitarioPyg === null || compra.costoUnitarioPyg === undefined)
  const pagado = Boolean(compra?.paidAt)
  const credito = compra?.condicion === 'CREDITO'
  const llego = Boolean(linea.llegoEl)
  const estado = estadoSobrePedido({
    stockPending: linea.pendientes, backorderArrivedAt: linea.llegoEl,
    need: { status: llego ? 'RECIBIDA' : compra ? 'COMPRADA' : 'ABIERTA', quantity: porComprar, arrivedAt: linea.llegoEl },
    shipmentStatus: compra?.enCamino ? 'EN_TRANSITO' : null, entregado: linea.entregado,
  })
  return {
    id: linea.id, productoId: linea.productoId, producto: linea.producto, condicion: linea.condicion,
    porComprar, pendientes: linea.pendientes, recibidas: linea.recibidas, conImei: linea.conImei,
    estado, estadoLabel: estado ? ESTADO_LABEL[estado] : null,
    siguientePaso: siguientePaso({ estado, faltaCosto, pagado, credito, avisado: Boolean(linea.avisadoEl) }),
    faltaCosto, pagado, pagoSinCuenta: Boolean(compra?.pagoSinCuenta), credito,
    prioridad: linea.prioridad, prometidaEl: linea.prometidaEl, centro: linea.centro, sucursal: linea.sucursal,
    pedidoId: linea.pedidoId, pedidoNumero: linea.pedidoNumero, clienteId: linea.clienteId, cliente: linea.cliente,
    avisadoEl: linea.avisadoEl, llegoEl: linea.llegoEl,
    compra: compra ? { id: compra.id, code: compra.code, estado: 'COMPRADA', condicion: compra.condicion, costoPyg: compra.costoUnitarioPyg === null ? null : compra.costoUnitarioPyg * compra.cantidad } : null,
    costoUnitarioPyg: compra?.costoUnitarioPyg ?? null,
  }
}

export function listarVentasSinStockDemo() {
  const lineas = leer().lineas.map(aFila).filter((fila) => fila.estado !== 'ENTREGADO')
  return {
    fecha: new Date().toISOString(),
    totales: { necesidades: lineas.length, grupos: lineas.length, unidades: lineas.reduce((suma, fila) => suma + fila.pendientes, 0) },
    contadores: { porEstado: {}, porPrioridad: {}, porOrigen: {}, vencidas: 0, sinAsignar: 0, sinCentro: 0, pendientes: lineas.length },
    grupos: [],
    lineas,
  }
}

export function avisarClienteDemo(data = {}) {
  const ids = Array.isArray(data.ids) ? data.ids : [data.id]
  const estado = leer()
  const ahora = new Date().toISOString()
  for (const linea of estado.lineas) if (ids.includes(linea.id)) {
    if (!linea.llegoEl) throw new Error('Todavía no llegó: avisá al cliente cuando llegue el producto.')
    linea.avisadoEl = ahora
  }
  escribir(estado)
  return { avisadas: ids.length, avisadoEl: ahora }
}

export function comprarSinStockDemo(data = {}) {
  const estado = leer()
  const contado = (data.paymentCondition || 'CONTADO') === 'CONTADO'
  const pideCuenta = Boolean(data.yaPagado || data.accountId)
  if (pideCuenta && !contado) throw new Error('Solo una compra al contado se registra como ya pagada: la de crédito se paga después con «Marcar pagado».')
  const lineasCompra = (data.lines || []).filter((fila) => fila.needId)
  const unitario = lineasCompra.find((fila) => Number(fila.unitCostPyg) > 0)?.unitCostPyg
  if (pideCuenta && !unitario) throw new Error('Para marcar la compra como pagada cargá primero el costo: sin monto no hay salida de caja.')
  estado.secuencia += 1
  const codigo = `CMP-AUR-${String(estado.secuencia).padStart(4, '0')}`
  const compra = { id: `demo-ss-compra-${estado.secuencia}`, code: codigo }
  for (const fila of lineasCompra) {
    const linea = estado.lineas.find((item) => item.id === fila.needId)
    if (!linea) throw new Error('Alguna necesidad no existe.')
    const cantidad = Math.min(linea.cantidad, Math.max(1, Math.round(Number(fila.quantity)) || 1))
    linea.compra = {
      id: compra.id, code: codigo, condicion: contado ? 'CONTADO' : 'CREDITO', proveedor: data.supplierName || 'Proveedor demo',
      costoUnitarioPyg: Number(fila.unitCostPyg) > 0 ? Number(fila.unitCostPyg) : null, cantidad, enCamino: false,
      paidAt: pideCuenta ? new Date().toISOString() : null, pagoSinCuenta: pideCuenta && !data.accountId,
    }
  }
  escribir(estado)
  return { ...compra, status: 'COMPRADA', paymentCondition: contado ? 'CONTADO' : 'CREDITO', paidAt: pideCuenta ? new Date().toISOString() : null }
}

export function actualizarCompraSinStockDemo(data = {}) {
  const estado = leer()
  const lineas = estado.lineas.filter((linea) => linea.compra?.id === data.id)
  if (!lineas.length) throw new Error('Compra no encontrada.')
  if (data.action === 'setCost') {
    const costo = Number(data.unitCostPyg)
    if (!Number.isSafeInteger(costo) || costo < 0) throw new Error('El costo unitario debe ser un entero en guaraníes.')
    for (const linea of lineas) linea.compra.costoUnitarioPyg = costo
    escribir(estado)
    return { id: data.id, ventasConCosto: lineas.length, costPyg: costo * lineas.reduce((suma, linea) => suma + linea.compra.cantidad, 0) }
  }
  if (data.action === 'markPaid') {
    const sinCosto = lineas.some((linea) => linea.compra.costoUnitarioPyg === null)
    if (sinCosto) throw new Error('Cargá primero el costo de la compra: sin monto no hay salida de caja.')
    if (lineas.some((linea) => linea.compra.paidAt)) throw new Error('La compra ya está pagada.')
    const conCuenta = Boolean(data.accountId)
    for (const linea of lineas) { linea.compra.paidAt = new Date().toISOString(); linea.compra.pagoSinCuenta = !conCuenta }
    escribir(estado)
    return { id: data.id, paidAt: new Date().toISOString(), pago: { conCuenta, pendienteDeCuenta: !conCuenta } }
  }
  throw new Error('Acción no disponible en la demo.')
}

export function recibirRapidoSinStockDemo(data = {}) {
  const estado = leer()
  const linea = estado.lineas.find((item) => item.id === data.needId)
  if (!linea) throw new Error('Necesidad no encontrada.')
  const cantidad = Math.round(Number(data.quantity))
  if (!Number.isFinite(cantidad) || cantidad < 1) throw new Error('Indicá cuántas unidades llegaron (1 o más).')
  if (linea.pendientes <= 0) throw new Error('Esa venta ya no tiene unidades pendientes de llegar.')
  if (!linea.compra) throw new Error('Primero registrá la compra de este producto.')
  const aplicadas = Math.min(cantidad, linea.pendientes, linea.compra.cantidad - linea.recibidas)
  linea.pendientes -= aplicadas
  linea.recibidas += aplicadas
  const llegoTodo = linea.pendientes === 0
  if (llegoTodo) linea.llegoEl = new Date().toISOString()
  escribir(estado)
  return { aplicadas, restantes: linea.pendientes, llegoTodo, needId: linea.id }
}

/** Estado en vivo para la franja del pedido en la demo (por número de pedido). */
export function estadoPedidoDemo(pedidoNumero) {
  const lineas = leer().lineas.filter((linea) => linea.pedidoNumero === pedidoNumero).map(aFila)
  return lineas.length ? lineas : null
}
