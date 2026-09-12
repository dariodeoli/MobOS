import test from 'node:test'
import assert from 'node:assert/strict'
import { tradeInDraftPayment } from './tradeInCheckout.js'
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
