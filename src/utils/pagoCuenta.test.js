import test from 'node:test'
import assert from 'node:assert/strict'
import { accountPayment, updateAccountPayment } from './pagoCuenta.js'

const CUENTAS = [
  { id: 'usd', name: 'Cuenta USD', currency: 'USD', kind: 'CASH', isActive: true },
  { id: 'pyg', name: 'Caja', currency: 'PYG', kind: 'CASH', isActive: true },
  { id: 'canje', name: 'Canje', currency: 'PYG', kind: 'TRADE_IN', isActive: true },
]

test('la cotización automática no pisa la que ya cargó el vendedor (#173-A)', () => {
  const conManual = { accountId: 'usd', originalAmount: '10', exchangeRatePyg: '7500', monto: '75000' }
  const resultado = updateAccountPayment(conManual, { exchangeRatePyg: '5935.01', automatico: true }, CUENTAS)
  assert.equal(resultado, conManual, 'devuelve el mismo pago sin tocar la cotización manual')
  assert.equal(resultado.exchangeRatePyg, '7500')
  assert.equal(resultado.monto, '75000')
  assert.equal('automatico' in resultado, false, 'la marca de automática no queda en el pago')
})

test('la cotización automática completa una fila USD que todavía no la tiene', () => {
  const vacia = { accountId: 'usd', originalAmount: '10', exchangeRatePyg: '' }
  const resultado = updateAccountPayment(vacia, { exchangeRatePyg: '5935.01', automatico: true }, CUENTAS)
  assert.equal(resultado.exchangeRatePyg, '5935.01')
  assert.equal(resultado.monto, '59350')
})

test('el equivalente en guaraníes sigue al monto original y a la cotización', () => {
  const base = { accountId: 'usd', originalAmount: '10', exchangeRatePyg: '7500' }
  const conOtraCotizacion = updateAccountPayment(base, { exchangeRatePyg: '7600' }, CUENTAS)
  assert.equal(conOtraCotizacion.monto, '76000')
  const conOtroMonto = updateAccountPayment(conOtraCotizacion, { originalAmount: '2' }, CUENTAS)
  assert.equal(conOtroMonto.monto, '15200')
})

test('una fila en guaraníes convierte con cotización 1', () => {
  const resultado = updateAccountPayment({ accountId: 'pyg', originalAmount: '25000' }, {}, CUENTAS)
  assert.equal(resultado.exchangeRatePyg, undefined)
  assert.equal(resultado.monto, '25000')
})

test('accountPayment convierte con la cotización de la fila', () => {
  const pago = accountPayment({ accountId: 'usd', originalAmount: '10', exchangeRatePyg: '7500' }, CUENTAS)
  assert.deepEqual(pago, { accountId: 'usd', originalAmount: 10, exchangeRatePyg: 7500, amountPyg: 75000, method: 'CASH', status: 'CONFIRMED' })
})

test('accountPayment rechaza la fila sin cotización o sin cuenta activa', () => {
  assert.throws(
    () => accountPayment({ accountId: 'usd', originalAmount: '10', exchangeRatePyg: '' }, CUENTAS),
    /cotización manual mayor a cero/,
  )
  assert.throws(
    () => accountPayment({ accountId: 'no-existe', originalAmount: '10' }, CUENTAS),
    /cuenta activa/,
  )
})

test('accountPayment exige serial, modelo y condición en el canje', () => {
  assert.throws(
    () => accountPayment({ accountId: 'canje', originalAmount: '50000' }, CUENTAS),
    /serial, modelo y condición/,
  )
  const pago = accountPayment(
    { accountId: 'canje', originalAmount: '50000', tradeIn: { serial: '356789102345678', model: 'iPhone 12', conditionNotes: 'Buen estado' } },
    CUENTAS,
  )
  assert.equal(pago.method, 'TRADE_IN')
  assert.deepEqual(pago.tradeIn, { serial: '356789102345678', model: 'iPhone 12', conditionNotes: 'Buen estado' })
})
