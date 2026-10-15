import assert from 'node:assert/strict'
import { evaluateCreditSale } from '../lib/credit-rules'

// Caso reportado por Dario: límite con deuda 1.500.000 y solo 500.000 de crédito
// disponible; venta a crédito de 4.850.000 → pide autorización.
const reportado = evaluateCreditSale({ limitPyg: 2_000_000, debtPyg: 1_500_000, unpaidPyg: 4_850_000 })
assert.equal(reportado.availablePyg, 500_000)
assert.equal(reportado.overPyg, 4_350_000)
assert.equal(reportado.requiresAuthorization, true)

// Dentro del disponible no pide nada, justo en el límite tampoco.
assert.equal(evaluateCreditSale({ limitPyg: 2_000_000, debtPyg: 1_500_000, unpaidPyg: 500_000 }).requiresAuthorization, false)
assert.equal(evaluateCreditSale({ limitPyg: 2_000_000, debtPyg: 1_500_000, unpaidPyg: 500_001 }).requiresAuthorization, true)
assert.equal(evaluateCreditSale({ limitPyg: 2_000_000, debtPyg: 1_500_000, unpaidPyg: 500_001 }).overPyg, 1)

// Crédito 0 o sin límite configurado: sin pase libre, aunque la deuda sea mínima.
const sinCredito = evaluateCreditSale({ limitPyg: 0, debtPyg: 14_800, unpaidPyg: 100_000 })
assert.equal(sinCredito.noLimit, true)
assert.equal(sinCredito.availablePyg, 0)
assert.equal(sinCredito.requiresAuthorization, true)
assert.equal(evaluateCreditSale({ limitPyg: 0, debtPyg: 0, unpaidPyg: 1 }).requiresAuthorization, true)

// Cliente ya pasado de su límite: el disponible no es negativo y todo nuevo saldo pide autorización.
const pasado = evaluateCreditSale({ limitPyg: 1_000_000, debtPyg: 1_200_000, unpaidPyg: 50_000 })
assert.equal(pasado.availablePyg, 0)
assert.equal(pasado.requiresAuthorization, true)

// Venta cobrada entera: no hay crédito en juego, aunque el cliente esté pasado.
assert.equal(evaluateCreditSale({ limitPyg: 0, debtPyg: 5_000_000, unpaidPyg: 0 }).requiresAuthorization, false)

// Entradas inválidas no producen números negativos ni NaN.
const raro = evaluateCreditSale({ limitPyg: -5, debtPyg: Number.NaN, unpaidPyg: 10 })
assert.equal(raro.limitPyg, 0)
assert.equal(raro.debtPyg, 0)
assert.equal(raro.requiresAuthorization, true)

console.log('credit-authorization.test.ts: ok')
