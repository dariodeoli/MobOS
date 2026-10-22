import test from 'node:test'
import assert from 'node:assert/strict'
import { creditoBloqueaEntrega, evaluarCredito, preguntaEntregaAplica, topeCredito } from './credito.js'

test('caso reportado: límite con deuda 1.500.000 y solo 500.000 disponibles pide autorización', () => {
  const evaluacion = evaluarCredito({ limite: 2000000, deuda: 1500000, saldo: 4850000 })
  assert.equal(evaluacion.disponible, 500000)
  assert.equal(evaluacion.exceso, 4350000)
  assert.equal(evaluacion.requiereAutorizacion, true)
  assert.equal(evaluarCredito({ limite: 2000000, deuda: 1500000, saldo: 500000 }).requiereAutorizacion, false)
  assert.equal(evaluarCredito({ limite: 2000000, deuda: 1500000, saldo: 500001 }).exceso, 1)
})

test('cliente con crédito 0 o sin límite: sin pase libre', () => {
  const sinCredito = evaluarCredito({ limite: 0, deuda: 14800, saldo: 100000 })
  assert.equal(sinCredito.sinLimite, true)
  assert.equal(sinCredito.disponible, 0)
  assert.equal(sinCredito.requiereAutorizacion, true)
  assert.equal(evaluarCredito({ limite: null, deuda: 0, saldo: 1 }).requiereAutorizacion, true)
  // Sin saldo (venta cobrada entera) no hay crédito en juego.
  assert.equal(evaluarCredito({ limite: 0, deuda: 5000000, saldo: 0 }).requiereAutorizacion, false)
})

test('la regla del cliente coincide con la del servidor ante entradas raras', () => {
  const raro = evaluarCredito({ limite: -5, deuda: Number.NaN, saldo: 10 })
  assert.equal(raro.limite, 0)
  assert.equal(raro.deuda, 0)
  assert.equal(raro.requiereAutorizacion, true)
})

test('un pedido con crédito pendiente o rechazado no se entrega', () => {
  assert.equal(creditoBloqueaEntrega({ creditAuthorization: { status: 'PENDING' } }), true)
  assert.equal(creditoBloqueaEntrega({ creditAuthorization: { status: 'REJECTED' } }), true)
  assert.equal(creditoBloqueaEntrega({ creditAuthorization: { status: 'APPROVED' } }), false)
  assert.equal(creditoBloqueaEntrega({}), false)
})

test('«¿ya se llevó el producto?» solo se pregunta en retiro de mostrador, sin entregar ni retener', () => {
  const base = { id: 'p1', deliveryType: 'Retiro en tienda', fulfillmentStatus: 'PROCESSING' }
  assert.equal(preguntaEntregaAplica(base), true)
  assert.equal(preguntaEntregaAplica({ ...base, deliveryType: 'RETIRO' }), true)
  assert.equal(preguntaEntregaAplica({ ...base, deliveryType: 'Delivery' }), false)
  assert.equal(preguntaEntregaAplica({ ...base, deliveryType: 'Encomienda' }), false)
  assert.equal(preguntaEntregaAplica({ ...base, deliveryType: 'Retiro en otra sucursal' }), false)
  assert.equal(preguntaEntregaAplica({ ...base, fulfillmentStatus: 'PICKED_UP' }), false)
  assert.equal(preguntaEntregaAplica({ ...base, creditAuthorization: { status: 'PENDING' } }), false)
  assert.equal(preguntaEntregaAplica({ ...base, creditAuthorization: { status: 'APPROVED' } }), true)
  assert.equal(preguntaEntregaAplica(null), false)
})

test('tolerancia: 100M + 10% pasa con 110M y pide autorización con 110.000.001', () => {
  const justo = evaluarCredito({ limite: 100000000, deuda: 0, saldo: 110000000, tolerancia: 10 })
  assert.equal(justo.requiereAutorizacion, false)
  assert.equal(justo.usaTolerancia, true)
  assert.equal(justo.tope, 110000000)
  const pasado = evaluarCredito({ limite: 100000000, deuda: 0, saldo: 110000001, tolerancia: 10 })
  assert.equal(pasado.requiereAutorizacion, true)
  assert.equal(pasado.exceso, 1)
  // Sin tolerancia (o valor inválido) rige el límite a secas.
  assert.equal(evaluarCredito({ limite: 100000000, deuda: 0, saldo: 100000001 }).requiereAutorizacion, true)
  assert.equal(evaluarCredito({ limite: 100000000, deuda: 0, saldo: 100000001, tolerancia: 15 }).requiereAutorizacion, true)
  assert.equal(topeCredito(1000005, 10), 1100005)
})
