import assert from 'node:assert/strict'
import { normalizarCosto, sinCosto } from '../lib/costs'
import type { CostoNormalizado } from '../lib/costs'

// ── Guaraníes: entero, sin decimales ────────────────────────────────────────
assert.deepEqual(normalizarCosto({ originalCost: 1500000, costCurrency: 'PYG' }), { costPyg: 1500000, originalCost: 1500000, costCurrency: 'PYG', exchangeRatePyg: null })
assert.deepEqual(normalizarCosto({ costPyg: 900000 }), { costPyg: 900000, originalCost: 900000, costCurrency: 'PYG', exchangeRatePyg: null })
assert.throws(() => normalizarCosto({ originalCost: 1500000.5, costCurrency: 'PYG' }), /no lleva decimales/)
assert.throws(() => normalizarCosto({ costPyg: 1500000.5 }), /no lleva decimales/)

// ── Dólares: dos decimales y cotización obligatoria ────────────────────────
assert.deepEqual(normalizarCosto({ originalCost: 350.5, costCurrency: 'USD', exchangeRatePyg: 7500 }), { costPyg: 2628750, originalCost: 350.5, costCurrency: 'USD', exchangeRatePyg: 7500 })
assert.throws(() => normalizarCosto({ originalCost: 350, costCurrency: 'USD' }), /cotización del USD/)
assert.throws(() => normalizarCosto({ originalCost: 350.555, costCurrency: 'USD', exchangeRatePyg: 7500 }), /hasta 2 decimales/)
assert.throws(() => normalizarCosto({ originalCost: 0.001, costCurrency: 'USD', exchangeRatePyg: 7500 }), /hasta 2 decimales/)
// El total en Gs explícito manda sobre la conversión, y sigue siendo entero.
assert.deepEqual(normalizarCosto({ originalCost: 350, costPyg: 2600000, costCurrency: 'USD', exchangeRatePyg: 7500 }).costPyg, 2600000)
assert.throws(() => normalizarCosto({ originalCost: 350, costPyg: 2600000.5, costCurrency: 'USD', exchangeRatePyg: 7500 }), /no lleva decimales/)

// ── Límites y cotización ───────────────────────────────────────────────────
assert.throws(() => normalizarCosto({ originalCost: -1 }), /Revisá el costo/)
assert.throws(() => normalizarCosto({ originalCost: 2147483647, costCurrency: 'USD', exchangeRatePyg: 2 }), /supera el máximo/)
assert.throws(() => normalizarCosto({ exchangeRatePyg: 0, originalCost: 10, costCurrency: 'USD' }), /Revisá la cotización/)
assert.throws(() => normalizarCosto({ costCurrency: 'USD' }), /Indicá el monto del costo/)
// Sin datos de costo la unidad queda pendiente (costo diferido).
assert.deepEqual(normalizarCosto({}), { costPyg: null, originalCost: null, costCurrency: 'PYG', exchangeRatePyg: null })

// ── Costo diferido: limpiar y conservar ────────────────────────────────────
const actual: Partial<CostoNormalizado> = { costPyg: 500000, originalCost: 500000, costCurrency: 'PYG', exchangeRatePyg: null }
assert.deepEqual(normalizarCosto({}, actual), actual, 'sin datos de costo se conserva lo cargado')
// Un cambio que no toca el costo (una nota, por ejemplo) tampoco lo pisa.
const edicionConNotas = { notes: 'raya' }
assert.deepEqual(normalizarCosto(edicionConNotas, actual), actual, 'editar otros campos no toca el costo')
assert.deepEqual(normalizarCosto({ costPyg: null }, actual), { costPyg: null, originalCost: null, costCurrency: 'PYG', exchangeRatePyg: null }, 'se puede dejar sin costo')
assert.deepEqual(normalizarCosto({ originalCost: null }, actual).costPyg, null)
// Completar después: se conserva la moneda cotizada de la unidad.
const antesEnDolares: Partial<CostoNormalizado> = { ...actual, costCurrency: 'USD', exchangeRatePyg: 7500 }
assert.deepEqual(normalizarCosto({ originalCost: 400 }, antesEnDolares), { costPyg: 3000000, originalCost: 400, costCurrency: 'USD', exchangeRatePyg: 7500 })

// ── Marca de "sin costo" ───────────────────────────────────────────────────
assert.equal(sinCosto({ costPyg: null, originalCost: null }), true)
assert.equal(sinCosto({ costPyg: 0, originalCost: 0 }), false, 'un costo 0 cargado no es pendiente')
assert.equal(sinCosto({ costPyg: 120000, originalCost: null }), false)
assert.equal(sinCosto(null), false)

console.log('costs.test.ts: ok')
