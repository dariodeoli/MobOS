import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizarModelo, tradeInDraftPayment, valorSugerido } from './tradeInCheckout.js'
const accounts = [{ id: 'canje', isActive: true, kind: 'TRADE_IN', currency: 'PYG', name: 'Canje' }]
const draft = { model: 'Equipo ficticio', imei: 'DEMO-123', conditionNotes: 'Pantalla rayada', value: 200000 }
test('ficha conserva importe, modelo, serial y condición en el pago', () => {
  const payment = tradeInDraftPayment(draft, accounts)
  assert.equal(payment.monto, '200000')
  assert.equal(payment.accountId, 'canje')
  assert.equal(payment.tradeIn.serial, 'DEMO-123')
  assert.equal(payment.tradeIn.conditionNotes, draft.conditionNotes)
})
test('no usa cuentas inactivas ni otra moneda', () => {
  assert.throws(() => tradeInDraftPayment(draft, []), /configurar/)
  assert.throws(() => tradeInDraftPayment(draft, [{ ...accounts[0], currency: 'USD' }]), /configurar/)
  assert.throws(() => tradeInDraftPayment(draft, [{ ...accounts[0], isActive: false }]), /configurar/)
})
test('rechaza ficha incompleta, importe inválido y serial repetido', () => {
  assert.throws(() => tradeInDraftPayment({ ...draft, conditionNotes: '' }, accounts), /Completá/)
  for (const value of [0, -1, 0.5, NaN, Infinity, 2147483648]) assert.throws(() => tradeInDraftPayment({ ...draft, value }, accounts), /valor/)
  assert.throws(() => tradeInDraftPayment(draft, accounts, [tradeInDraftPayment(draft, accounts)]), /ya está/)
})
test('normaliza el modelo como la clave del backend', () => {
  assert.equal(normalizarModelo('  iPhone  13  Pro '), 'iphone 13 pro')
  assert.equal(normalizarModelo('Audífonos AÍR'), 'audifonos air')
})
test('sugiere solo la valuación exacta de modelo y condición cargados', () => {
  const valuations = [
    { id: 'a', modelKey: 'iphone 13', condition: 'USED', baseValuePyg: 1500000, isActive: true },
    { id: 'b', modelKey: 'iphone 13 pro', condition: 'USED', baseValuePyg: 2500000, isActive: true },
    { id: 'c', modelKey: 'iphone 13', condition: 'REFURBISHED', baseValuePyg: 1200000, isActive: true },
    { id: 'd', modelKey: 'iphone 13', condition: 'USED', baseValuePyg: 900000, isActive: false },
  ]
  assert.equal(valorSugerido(valuations, 'iPhone 13', 'USED').id, 'a')
  assert.equal(valorSugerido(valuations, 'iPhone 13 PRO', 'USED').id, 'b')
  assert.equal(valorSugerido(valuations, 'iPhone 13', 'REFURBISHED').id, 'c')
  assert.equal(valorSugerido(valuations, 'iPhone 13 128GB', 'USED'), null)
  assert.equal(valorSugerido(valuations, 'iPhone 14', 'USED'), null)
  assert.equal(valorSugerido(null, 'iPhone 13', 'USED'), null)
})
