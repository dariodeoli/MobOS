import assert from 'node:assert/strict'
import test from 'node:test'
import { ACENTO_POR_DEFECTO, acentoDeEmpresa, desgloseVenta, garantiaDeVenta, pagosEnVerificacion, serialesDeItem, siglaProveedor } from './ventaPapel.js'

test('el proveedor sale como sigla: la cargada o las iniciales, nunca el nombre real', () => {
  assert.equal(siglaProveedor('Mayorista Apple PY', 'mel'), 'MEL')
  assert.equal(siglaProveedor('Mayorista Apple PY'), 'MAP')
  assert.equal(siglaProveedor('Miami'), 'MIAM')
  assert.equal(siglaProveedor(''), '')
})

test('los seriales salen del pedido o de los campos legacy, sin repetir', () => {
  assert.deepEqual(serialesDeItem({ serials: ['3569', '3569', ' '], imei: '3570' }), ['3569', '3570'])
  assert.deepEqual(serialesDeItem({ unit: { serial: 'SN1' } }), ['SN1'])
  assert.deepEqual(serialesDeItem({}), [])
})

test('el acento es el de la marca si es un hex válido, si no el de la app', () => {
  assert.equal(acentoDeEmpresa({ brandColor: '#AA3300' }), '#aa3300')
  assert.equal(acentoDeEmpresa({ brandColor: 'red; background:url(x)' }), ACENTO_POR_DEFECTO)
  assert.equal(acentoDeEmpresa(null), ACENTO_POR_DEFECTO)
})

test('la garantía usa los días de las líneas y cae a la leyenda general', () => {
  assert.match(garantiaDeVenta({ items: [{ warrantyDays: 90 }, { warrantyDays: 30 }] }), /30 a 90 días/)
  assert.match(garantiaDeVenta({ items: [{}] }), /condiciones de la tienda/)
})

test('el desglose muestra subtotal, pagado y saldo solo cuando aplican', () => {
  const simple = desgloseVenta({ totalPyg: 100, subtotalPyg: 100, payments: [{ status: 'CONFIRMED', amountPyg: 100 }] })
  assert.equal(simple.mostrarSubtotal, false)
  assert.equal(simple.mostrarPagado, false)
  assert.equal(simple.saldo, 0)
  const parcial = desgloseVenta({ totalPyg: 100, discountPyg: 10, payments: [{ status: 'CONFIRMED', amountPyg: 40 }, { status: 'PENDING', amountPyg: 60 }] })
  assert.equal(parcial.mostrarSubtotal, true)
  assert.equal(parcial.pagado, 40)
  assert.equal(parcial.saldo, 60)
  assert.equal(parcial.mostrarPagado, true)
})

test('un cobro en verificación no suma como pagado pero se marca «En verificación» en el papel', () => {
  const pedido = {
    totalPyg: 800000,
    payments: [
      { status: 'CONFIRMED', method: 'CASH', amountPyg: 300000 },
      { status: 'PENDING', pendingReason: 'VERIFICACION', method: 'TRANSFER', amountPyg: 500000 },
      { status: 'PENDING', pendingReason: 'CUOTA', method: 'CREDIT', amountPyg: 1000 },
    ],
  }
  assert.equal(pagosEnVerificacion(pedido).length, 1)
  const desglose = desgloseVenta(pedido)
  assert.equal(desglose.enVerificacionPyg, 500000)
  assert.equal(desglose.pagado, 300000, 'lo pendiente de verificar no suma')
  assert.equal(desglose.saldo, 500000)
  assert.equal(pagosEnVerificacion({ totalPyg: 1, payments: [{ status: 'CONFIRMED', amountPyg: 1 }] }).length, 0)
})
