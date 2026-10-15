// Crédito sobre el límite en la demo: mismas reglas que el servidor
// (backend/lib/credit-authorization.ts), guardadas solo en este navegador.
//   · la deuda del cliente sale de los pedidos con saldo de su ficha demo;
//   · una venta a crédito que la supera (o de un cliente sin crédito) queda
//     «Pendiente de autorización de crédito» y NO se entrega;
// Las funciones que tocan las ventas reciben el `almacen` ({ listar, actualizar });
// la interfaz usa demoCreditoStore.js, que lo conecta al almacén de la demo.
//   · autoriza el dueño/gerente (con el check «Autorizo yo»), un PIN de gerente
//     o administrador del equipo demo, o más tarde desde el pedido.
import { buscarClienteDemo, actualizarClienteDemo } from './demoClientes.js'
import { perfilDemoPorPin } from './demo/equipo.js'
import { evaluarCredito } from './credito.js'

const APROBADORES = ['ADMIN', 'GERENTE']
export const esAprobadorDemo = (rol) => ['dueno', 'ADMIN', 'GERENTE'].includes(rol)

/** Deuda abierta del cliente demo: saldo de sus pedidos (lo que ve la ficha). */
export function deudaDemoDeCliente(clienteId) {
  const cliente = buscarClienteDemo(clienteId)
  const pedidos = cliente?.demoProfile?.orders
  if (!Array.isArray(pedidos)) return 0
  return pedidos.reduce((suma, pedido) => suma + (pedido.status === 'CANCELLED' ? 0 : Number(pedido.pendingPyg || 0)), 0)
}

export function evaluarCreditoDemo({ clienteId, limite, saldo }) {
  return evaluarCredito({ limite, deuda: deudaDemoDeCliente(clienteId), saldo })
}

const resumen = (evaluacion, extra) => ({
  id: `demo-credito-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
  overPyg: evaluacion.exceso,
  limitPyg: evaluacion.limite,
  debtPyg: evaluacion.deuda,
  unpaidPyg: evaluacion.saldo,
  availablePyg: evaluacion.disponible,
  requestedAt: new Date().toISOString(),
  resolvedAt: null,
  resolvedByName: null,
  resolvedNote: null,
  ...extra,
})

/**
 * Decide el estado de crédito de una venta demo. Devuelve null si no hace falta
 * autorización; si el PIN no es de un gerente o administrador, lanza el mismo
 * error que el servidor y la venta no se crea.
 */
export function autorizacionCreditoDemo({ evaluacion, pin = '', yoAutorizo = false, sesion }) {
  if (!evaluacion?.requiereAutorizacion) return null
  const vendedor = sesion?.nombre || 'Equipo demo'
  if (pin) {
    const perfil = perfilDemoPorPin(pin)
    if (!perfil || !APROBADORES.includes(perfil.rol)) throw new Error('PIN de gerente o administrador incorrecto.')
    return resumen(evaluacion, { status: 'APPROVED', requestedByName: vendedor, resolvedAt: new Date().toISOString(), resolvedByName: perfil.nombre })
  }
  if (yoAutorizo) {
    if (!esAprobadorDemo(sesion?.rol)) throw new Error('Solo administración o gerencia pueden autorizar el crédito.')
    return resumen(evaluacion, { status: 'APPROVED', requestedByName: vendedor, resolvedAt: new Date().toISOString(), resolvedByName: vendedor })
  }
  return resumen(evaluacion, { status: 'PENDING', requestedByName: vendedor })
}

const ventasDelPedido = (almacen, orderNumber) => almacen.listar().filter((venta) => venta.orderNumber && venta.orderNumber === orderNumber)

function actualizarPedidoDeCliente(clienteId, orderNumber, cambios) {
  const cliente = buscarClienteDemo(clienteId)
  const pedidos = cliente?.demoProfile?.orders
  if (!Array.isArray(pedidos)) return
  const pedido = pedidos.find((fila) => fila.orderNumber === orderNumber)
  if (!pedido) return
  Object.assign(pedido, cambios)
  actualizarClienteDemo(cliente)
}

/**
 * Aprueba o rechaza desde el pedido. Aprueba el dueño/gerente con su sesión o
 * cualquiera con el PIN de uno de ellos; rechazar pide motivo.
 */
export function resolverCreditoDemo({ almacen, orderNumber, accion, pin = '', nota = '', sesion }) {
  const filas = ventasDelPedido(almacen, orderNumber)
  const actual = filas[0]?.creditAuthorization
  if (!actual) throw new Error('Este pedido no tiene una autorización de crédito.')
  if (actual.status !== 'PENDING') throw new Error('La autorización de crédito ya fue resuelta.')
  let aprobador = sesion?.nombre || 'Equipo demo'
  if (pin) {
    const perfil = perfilDemoPorPin(pin)
    if (!perfil || !APROBADORES.includes(perfil.rol)) throw new Error('PIN de gerente o administrador incorrecto.')
    aprobador = perfil.nombre
  } else if (!esAprobadorDemo(sesion?.rol)) {
    throw new Error('Solo administración o gerencia pueden autorizar el crédito. Ingresá su PIN.')
  }
  if (accion === 'reject' && !String(nota).trim()) throw new Error('Indicá el motivo del rechazo.')
  const resuelta = { ...actual, status: accion === 'approve' ? 'APPROVED' : 'REJECTED', resolvedAt: new Date().toISOString(), resolvedByName: aprobador, resolvedNote: String(nota).trim() || null }
  for (const fila of filas) almacen.actualizar(fila.id, { creditAuthorization: resuelta })
  const clienteId = filas[0]?.clienteId || filas[0]?.customer?.id
  if (clienteId) actualizarPedidoDeCliente(clienteId, orderNumber, { creditAuthorization: resuelta })
  return resuelta
}

/**
 * El vendedor confirma que el cliente ya se llevó el producto. Nunca se marca
 * solo: si el crédito está pendiente o rechazado, no se entrega.
 */
export function marcarEntregaDemo({ almacen, orderNumber, estado = 'PICKED_UP' }) {
  const filas = ventasDelPedido(almacen, orderNumber)
  if (!filas.length) throw new Error('Pedido no encontrado.')
  const credito = filas[0].creditAuthorization?.status
  if (credito === 'PENDING') throw new Error('Pendiente de autorización de crédito: un administrador o gerente debe autorizar la entrega.')
  if (credito === 'REJECTED') throw new Error('La autorización de crédito fue rechazada. El pedido no se puede entregar.')
  for (const fila of filas) almacen.actualizar(fila.id, { fulfillmentStatus: estado })
  const clienteId = filas[0]?.clienteId || filas[0]?.customer?.id
  if (clienteId) actualizarPedidoDeCliente(clienteId, orderNumber, { fulfillmentStatus: estado })
  return estado
}

/** Solicitudes de crédito de la demo con la forma de la lista «Autorizaciones». */
export function autorizacionesCreditoDemo(almacen) {
  const vistos = new Set()
  const filas = []
  for (const venta of almacen.listar()) {
    const credito = venta.creditAuthorization
    if (!credito || !venta.orderNumber || vistos.has(venta.orderNumber)) continue
    vistos.add(venta.orderNumber)
    filas.push({
      id: credito.id,
      status: credito.status,
      kind: 'ORDER_CREDIT_OVER',
      entity: 'ORDER',
      entityId: venta.id,
      customer: { id: venta.clienteId || null, name: venta.cliente || venta.customer?.name || 'Cliente' },
      requestedValue: { orderNumber: venta.orderNumber, overPyg: credito.overPyg, limitPyg: credito.limitPyg, debtPyg: credito.debtPyg, unpaidPyg: credito.unpaidPyg },
      requestedById: venta.vendedorId || 'demo-user',
      requestedBy: { id: venta.vendedorId || 'demo-user', name: credito.requestedByName || venta.vendedorNombre || 'Equipo demo' },
      resolvedBy: credito.resolvedByName ? { name: credito.resolvedByName } : null,
      resolvedAt: credito.resolvedAt,
      resolvedNote: credito.resolvedNote,
      createdAt: credito.requestedAt,
    })
  }
  return filas
}
