import assert from 'node:assert/strict'
import test from 'node:test'
import { orderAcceptsCharges, parseSpecialOrder, summarizeBalance, validateCharge } from '../lib/special-orders'

// Bordes del pedido especial con seña: la seña es un pago parcial que baja el
// saldo, nunca se cobra más que el saldo y una venta cancelada no admite cobros
// nuevos. Las funciones son puras: cubren la regla sin tocar la base.

test('la marca de pedido especial viaja con una fecha esperada válida', () => {
  const conFecha = parseSpecialOrder({ specialOrder: true, expectedAt: '2026-10-15' })
  assert.equal(conFecha.isSpecialOrder, true)
  assert.equal(conFecha.expectedAt?.getDate(), 15)
  assert.equal(conFecha.expectedAt?.getMonth(), 9)
  assert.equal(conFecha.expectedAt?.getHours(), 12, 'la fecha sin hora se fija al mediodía local')
  assert.equal(parseSpecialOrder({ specialOrder: true }).expectedAt, null)
  const iso = parseSpecialOrder({ specialOrder: true, expectedAt: '2026-10-15T18:30:00.000Z' })
  assert.equal(iso.expectedAt?.toISOString(), '2026-10-15T18:30:00.000Z')
})

test('sin la marca, la fecha esperada es un error', () => {
  assert.throws(() => parseSpecialOrder({ expectedAt: '2026-10-15' }), /solo aplica a un pedido especial/i)
  assert.throws(() => parseSpecialOrder({ specialOrder: 'sí' }), /debe ser booleana/i)
  assert.throws(() => parseSpecialOrder({ specialOrder: true, expectedAt: 'no-es-fecha' }), /fecha esperada es inválida/i)
})

test('la seña baja el saldo del pedido', () => {
  const soloSena = summarizeBalance(1000000, [{ status: 'CONFIRMED', amountPyg: 300000 }])
  assert.equal(soloSena.collectedPyg, 300000)
  assert.equal(soloSena.balancePyg, 700000)
  assert.equal(soloSena.excessPyg, 0)
  const conCobroParcial = summarizeBalance(1000000, [
    { status: 'CONFIRMED', amountPyg: 300000 },
    { status: 'CONFIRMED', amountPyg: 200000 },
  ])
  assert.equal(conCobroParcial.balancePyg, 500000)
  const pendientes = summarizeBalance(1000000, [
    { status: 'CONFIRMED', amountPyg: 300000 },
    { status: 'PENDING', amountPyg: 200000 },
  ])
  assert.equal(pendientes.balancePyg, 700000, 'un pago pendiente no baja el saldo')
})

test('una seña mayor al total se informa como excedente', () => {
  const excedida = summarizeBalance(1000000, [{ status: 'CONFIRMED', amountPyg: 1200000 }])
  assert.equal(excedida.balancePyg, 0)
  assert.equal(excedida.excessPyg, 200000)
})

test('no se cobra más que el saldo pendiente', () => {
  const ok = validateCharge({ totalPyg: 1000000, collectedPyg: 300000, amountPyg: 700000 })
  assert.equal(ok.ok, true)
  if (ok.ok) assert.equal(ok.balancePyg, 0)
  const excedido = validateCharge({ totalPyg: 1000000, collectedPyg: 300000, amountPyg: 700001 })
  assert.equal(excedido.ok, false)
  if (!excedido.ok) assert.equal(excedido.code, 'OVER_BALANCE')
  const invalido = validateCharge({ totalPyg: 1000000, collectedPyg: 0, amountPyg: 0 })
  assert.equal(invalido.ok, false)
  if (!invalido.ok) assert.equal(invalido.code, 'INVALID_AMOUNT')
})

test('la seña mayor al total también se rechaza al cobrar', () => {
  const resultado = validateCharge({ totalPyg: 500000, collectedPyg: 0, amountPyg: 600000 })
  assert.equal(resultado.ok, false)
  if (!resultado.ok) assert.equal(resultado.code, 'OVER_BALANCE')
})

test('una venta cancelada o completada no admite cobros nuevos', () => {
  assert.equal(orderAcceptsCharges('PENDING'), true)
  assert.equal(orderAcceptsCharges('CANCELLED'), false)
  assert.equal(orderAcceptsCharges('COMPLETED'), false)
  const cancelada = validateCharge({ totalPyg: 500000, collectedPyg: 200000, amountPyg: 100000, status: 'CANCELLED' })
  assert.equal(cancelada.ok, false)
  if (!cancelada.ok) assert.equal(cancelada.code, 'CLOSED_ORDER')
})
