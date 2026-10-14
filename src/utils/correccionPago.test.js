import test from 'node:test'
import assert from 'node:assert/strict'
import { corregirPagoDemo } from '../lib/demoCorreccionPago.js'
import { cuerpoCorreccion, errorCorreccion, evaluarCorreccionPago, puedeDejarAlRepartidor, restanteCorreccion, reversionesPorOriginal } from './correccionPago.js'

const pago = { id: 'p1', method: 'TRANSFER', status: 'CONFIRMED', amountPyg: 100000, currency: 'PYG', userId: 'u1' }
const admin = { id: 'a', role: 'ADMIN' }
const cuentas = [{ id: 'c1', kind: 'CASH', name: 'Caja', currency: 'PYG' }, { id: 't1', kind: 'TRANSFER', name: 'Itaú', currency: 'PYG' }]
const puede = (args) => evaluarCorreccionPago(args).puede

test('gerencia corrige; reversiones, correcciones, ya corregidos y cobros del repartidor no (#393)', () => {
  assert.equal(puede({ pago, pagos: [pago], pedido: {}, usuario: admin }), true)
  assert.equal(puede({ pago: { ...pago, reversalOfId: 'x' }, usuario: admin }), false)
  assert.equal(puede({ pago: { ...pago, correctionId: 'x' }, usuario: admin }), false)
  assert.equal(puede({ pago, pagos: [pago, { id: 'r', reversalOfId: 'p1' }], usuario: admin }), false)
  assert.equal(puede({ pago: { ...pago, deliveryUserId: 'd' }, usuario: admin }), false)
})

test('medios fuera de alcance, no PYG y pedido anulado no se corrigen (#393)', () => {
  for (const method of ['GIFT_CARD', 'TRADE_IN', 'STORE_CREDIT']) assert.equal(puede({ pago: { ...pago, method }, usuario: admin }), false)
  assert.equal(puede({ pago: { ...pago, currency: 'USD' }, usuario: admin }), false)
  assert.equal(puede({ pago, pedido: { status: 'CANCELLED' }, usuario: admin }), false)
})

test('el personal solo corrige lo propio y si el dueño lo habilita; verificado solo ADMIN (#393)', () => {
  const cajera = { id: 'u1', role: 'CAJERA' }
  assert.equal(puede({ pago, usuario: cajera }), true)
  assert.equal(puede({ pago, usuario: { id: 'u2', role: 'VENDEDOR' } }), false)
  assert.equal(puede({ pago, usuario: cajera, personalPuede: false }), false)
  assert.equal(puede({ pago, usuario: { id: 'g', role: 'GERENTE' }, conciliacion: 'VERIFIED' }), false)
  assert.equal(puede({ pago, usuario: admin, conciliacion: 'VERIFIED' }), true)
  assert.equal(puede({ pago, usuario: { id: 'x', role: 'REPARTIDOR' } }), false)
})

test('efectivo al repartidor solo gerencia con repartidor asignado (#393)', () => {
  assert.equal(puedeDejarAlRepartidor(admin, { assignedToId: 'd' }), true)
  assert.equal(puedeDejarAlRepartidor({ role: 'GERENTE' }, { assignedToId: 'd' }), true)
  assert.equal(puedeDejarAlRepartidor(admin, {}), false)
  assert.equal(puedeDejarAlRepartidor({ role: 'CAJERA' }, { assignedToId: 'd' }), false)
  assert.equal(puedeDejarAlRepartidor({ role: 'VENDEDOR' }, { assignedToId: 'd' }), false)
})

test('el resto, la suma exacta y el motivo habilitan el envío (#393)', () => {
  const filas = [{ accountId: 'c1', amount: 40000 }, { accountId: 't1', amount: 60000, toDriver: false }]
  assert.equal(restanteCorreccion(pago, [{ amount: 30000 }]), 70000)
  assert.equal(errorCorreccion({ original: pago, filas, motivo: 'se cobró en caja' }), null)
  assert.match(errorCorreccion({ original: pago, filas, motivo: ' a ' }), /motivo/)
  assert.match(errorCorreccion({ original: pago, filas: [{ accountId: 'c1', amount: 99999 }], motivo: 'abc' }), /sumar exactamente/)
  assert.match(errorCorreccion({ original: pago, filas: [{ accountId: '', amount: 100000 }], motivo: 'abc' }), /cuenta/)
})

test('arma el cuerpo del endpoint y mapea reversiones (#393)', () => {
  assert.deepEqual(cuerpoCorreccion({ motivo: ' motivo ', filas: [{ accountId: 'c1', amount: 100000, toDriver: true }] }), { reason: 'motivo', payments: [{ accountId: 'c1', amount: 100000, toDriver: true }] })
  assert.equal(reversionesPorOriginal([pago, { id: 'r', reversalOfId: 'p1' }]).get('p1').id, 'r')
})

const pedido = { id: 'o1', pagos: [{ ...pago, monto: 100000, accountId: 't1' }], totalPagado: 100000, totalPendiente: 0, assignedToId: 'd' }

test('demo: revierte el original y crea los pagos nuevos con el motivo (#393)', () => {
  const r = corregirPagoDemo({ pedido, original: pedido.pagos[0], motivo: 'fue efectivo', filas: [{ accountId: 'c1', amount: 100000 }], cuentas })
  assert.equal(r.pagos.length, 3)
  assert.equal(r.pagos[1].reversalOfId, 'p1')
  assert.equal(r.pagos[1].amountPyg, -100000)
  assert.equal(r.pagos[2].method, 'CASH')
  assert.equal(r.pagos[2].correctionReason, 'fue efectivo')
  assert.equal(r.totalPagado, 100000)
})

test('demo: efectivo al repartidor queda pendiente y reabre el saldo (#393)', () => {
  const r = corregirPagoDemo({ pedido, original: pedido.pagos[0], motivo: 'lo tiene el repartidor', filas: [{ accountId: 'c1', amount: 100000, toDriver: true }], cuentas, repartidor: true })
  assert.equal(r.pagos[2].status, 'PENDING')
  assert.equal(r.pagos[2].deliveryUserId, 'd')
  assert.equal(r.totalPendiente, 100000)
})

test('demo: rechaza suma distinta, mismo medio y doble corrección (#393)', () => {
  const original = pedido.pagos[0]
  assert.throws(() => corregirPagoDemo({ pedido, original, motivo: 'abc', filas: [{ accountId: 'c1', amount: 5 }], cuentas }), /sumar/)
  assert.throws(() => corregirPagoDemo({ pedido, original, motivo: 'abc', filas: [{ accountId: 't1', amount: 100000 }], cuentas }), /igual al original/)
  const ya = { ...pedido, pagos: [...pedido.pagos, { id: 'r', reversalOfId: 'p1' }] }
  assert.throws(() => corregirPagoDemo({ pedido: ya, original, motivo: 'abc', filas: [{ accountId: 'c1', amount: 100000 }], cuentas }), /ya fue corregido/)
})
