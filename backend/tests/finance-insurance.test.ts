// Seguro de ventas (#162): porcentaje por empresa sobre el costo del producto.
// El ejemplo de la spec: costo 100.000, venta 150.000, seguro 25% → costo real
// 125.000 y margen 25.000 (sin seguro el margen sería 50.000).
import assert from 'node:assert/strict'
import { FinanceInputError, margenConSeguro, realMargin, seguroDeCosto } from '../lib/finance'

const ejemplo = margenConSeguro({ costoPyg: 100_000, ventaPyg: 150_000, seguroPct: 25 })
assert.deepEqual(ejemplo, { seguroPyg: 25_000, costoRealPyg: 125_000, margenPyg: 25_000 })
assert.equal(margenConSeguro({ costoPyg: 100_000, ventaPyg: 150_000, seguroPct: 0 }).margenPyg, 50_000)

// Redondeo al guaraní y porcentajes con decimales del negocio.
assert.equal(seguroDeCosto(99_999, 25), 25_000)
assert.equal(seguroDeCosto(100_000, 5.5), 5_500)
assert.equal(seguroDeCosto(100_000, 100), 100_000)

// El costo real entra al margen ya congelado por línea (unitCostPyg incluye
// base + seguro + extras), así que el indicador no vuelve a sumar el seguro.
const conSeguro = realMargin([{ quantity: 1, totalPyg: 150_000, unitCostPyg: 125_000, insurancePyg: 25_000 }])
assert.equal(conSeguro.costPyg, 125_000)
assert.equal(conSeguro.profitPyg, 25_000)
assert.equal(conSeguro.marginPct, 16.67)
const sinSeguro = realMargin([{ quantity: 1, totalPyg: 150_000, unitCostPyg: 100_000 }])
assert.equal(sinSeguro.profitPyg, 50_000)

// Entradas inválidas no pasan.
assert.throws(() => seguroDeCosto(-1, 25), FinanceInputError)
assert.throws(() => seguroDeCosto(100_000, 101), FinanceInputError)
assert.throws(() => seguroDeCosto(100_000, -1), FinanceInputError)

console.log('finance-insurance: formula del seguro y efecto en el margen OK')
