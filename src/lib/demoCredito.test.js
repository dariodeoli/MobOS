// Crédito sobre el límite en la demo: misma regla que el servidor. Sin navegador:
// el almacén de ventas se reemplaza por uno en memoria.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autorizacionCreditoDemo, autorizacionesCreditoDemo, deudaDemoDeCliente, evaluarCreditoDemo, marcarEntregaDemo, resolverCreditoDemo } from './demoCredito.js'
import { registrarPedidoDemoDeVenta } from './demoClientes.js'

const MARIA = 'demo-cliente-maria' // límite 1.500.000
const vendedor = { nombre: 'Diego López', rol: 'VENDEDOR' }
const dueno = { nombre: 'Hernán Acosta', rol: 'dueno' }

function almacenCon(ventas) {
  return { listar: () => ventas, actualizar: (id, cambios) => { const fila = ventas.find((v) => v.id === id); Object.assign(fila, cambios) } }
}

test('una venta de mostrador de la demo NO nace «Retirado»: queda en preparación', () => {
  const pedido = registrarPedidoDemoDeVenta(MARIA, { numero: 'AUR-0501', total: 300000, pagado: 300000, vendedor: 'Diego López', items: [] })
  assert.equal(pedido.fulfillmentStatus, 'PROCESSING')
  assert.equal(pedido.deliveryType, 'RETIRO')
})

test('la venta a crédito que supera el disponible queda pendiente de autorización', () => {
  const deuda = deudaDemoDeCliente(MARIA)
  const evaluacion = evaluarCreditoDemo({ clienteId: MARIA, limite: 1500000, saldo: 4850000 })
  assert.equal(evaluacion.deuda, deuda)
  assert.equal(evaluacion.requiereAutorizacion, true)
  const credito = autorizacionCreditoDemo({ evaluacion, sesion: vendedor })
  assert.equal(credito.status, 'PENDING')
  assert.equal(credito.overPyg, evaluacion.exceso)
  assert.equal(credito.requestedByName, 'Diego López')
})

test('dentro del crédito disponible no pide autorización', () => {
  const evaluacion = evaluarCreditoDemo({ clienteId: MARIA, limite: 1500000, saldo: 0 })
  assert.equal(autorizacionCreditoDemo({ evaluacion, sesion: vendedor }), null)
})

test('cliente sin crédito: pide autorización igual (sin pase libre)', () => {
  const evaluacion = evaluarCreditoDemo({ clienteId: 'demo-cliente-inexistente', limite: 0, saldo: 100000 })
  assert.equal(evaluacion.sinLimite, true)
  assert.equal(autorizacionCreditoDemo({ evaluacion, sesion: vendedor }).status, 'PENDING')
})

test('autorizar en el mostrador: solo con el PIN de un gerente o administrador, o el dueño/gerente que vende', () => {
  const evaluacion = evaluarCreditoDemo({ clienteId: MARIA, limite: 1500000, saldo: 4850000 })
  assert.throws(() => autorizacionCreditoDemo({ evaluacion, pin: '2001', sesion: vendedor }), /PIN de gerente o administrador incorrecto/)
  assert.throws(() => autorizacionCreditoDemo({ evaluacion, pin: '0000', sesion: vendedor }), /incorrecto/)
  assert.throws(() => autorizacionCreditoDemo({ evaluacion, yoAutorizo: true, sesion: vendedor }), /Solo administración o gerencia/)
  assert.equal(autorizacionCreditoDemo({ evaluacion, pin: '2002', sesion: vendedor }).resolvedByName, 'Ana Giménez')
  assert.equal(autorizacionCreditoDemo({ evaluacion, pin: '3001', sesion: vendedor }).status, 'APPROVED')
  assert.equal(autorizacionCreditoDemo({ evaluacion, yoAutorizo: true, sesion: dueno }).resolvedByName, 'Hernán Acosta')
})

test('el pedido retenido no se entrega hasta que lo autorice un administrador o gerente', () => {
  const evaluacion = evaluarCreditoDemo({ clienteId: MARIA, limite: 1500000, saldo: 4850000 })
  const credito = autorizacionCreditoDemo({ evaluacion, sesion: vendedor })
  const ventas = [{ id: 'v1', orderNumber: 'AUR-0502', clienteId: MARIA, cliente: 'María González', creditAuthorization: credito, fulfillmentStatus: 'PROCESSING', vendedorId: 'demo-user-vendedor' }]
  const almacen = almacenCon(ventas)

  assert.throws(() => marcarEntregaDemo({ almacen, orderNumber: 'AUR-0502' }), /Pendiente de autorización de crédito/)
  assert.equal(ventas[0].fulfillmentStatus, 'PROCESSING', 'sigue sin entregar')
  assert.equal(autorizacionesCreditoDemo(almacen).length, 1, 'aparece en Autorizaciones')

  // Un vendedor sin PIN no aprueba; con un PIN que no es de gerente tampoco.
  assert.throws(() => resolverCreditoDemo({ almacen, orderNumber: 'AUR-0502', accion: 'approve', sesion: vendedor }), /Solo administración o gerencia/)
  assert.throws(() => resolverCreditoDemo({ almacen, orderNumber: 'AUR-0502', accion: 'approve', pin: '2006', sesion: vendedor }), /incorrecto/)
  assert.equal(ventas[0].creditAuthorization.status, 'PENDING')

  const aprobada = resolverCreditoDemo({ almacen, orderNumber: 'AUR-0502', accion: 'approve', pin: '2002', sesion: vendedor })
  assert.equal(aprobada.status, 'APPROVED')
  assert.equal(aprobada.resolvedByName, 'Ana Giménez')
  assert.throws(() => resolverCreditoDemo({ almacen, orderNumber: 'AUR-0502', accion: 'approve', sesion: dueno }), /ya fue resuelta/)

  // Aprobado el crédito, el vendedor confirma la entrega (nunca se marca sola).
  assert.equal(marcarEntregaDemo({ almacen, orderNumber: 'AUR-0502' }), 'PICKED_UP')
  assert.equal(ventas[0].fulfillmentStatus, 'PICKED_UP')
})

test('rechazar pide motivo y deja el pedido sin entregar', () => {
  const evaluacion = evaluarCreditoDemo({ clienteId: MARIA, limite: 1500000, saldo: 4850000 })
  const ventas = [{ id: 'v2', orderNumber: 'AUR-0503', clienteId: MARIA, creditAuthorization: autorizacionCreditoDemo({ evaluacion, sesion: vendedor }), fulfillmentStatus: 'PROCESSING' }]
  const almacen = almacenCon(ventas)
  assert.throws(() => resolverCreditoDemo({ almacen, orderNumber: 'AUR-0503', accion: 'reject', sesion: dueno }), /motivo/)
  const rechazada = resolverCreditoDemo({ almacen, orderNumber: 'AUR-0503', accion: 'reject', nota: 'Debe tres facturas', sesion: dueno })
  assert.equal(rechazada.status, 'REJECTED')
  assert.throws(() => marcarEntregaDemo({ almacen, orderNumber: 'AUR-0503' }), /rechazada/)
})
