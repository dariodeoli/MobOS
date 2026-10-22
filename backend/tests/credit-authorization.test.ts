import assert from 'node:assert/strict'
import { creditCapPyg, evaluateCreditSale, normalizeTolerancePct } from '../lib/credit-rules'
// Copia del front: tiene que dar EXACTAMENTE lo mismo que el servidor.
// @ts-ignore el front es JavaScript sin tipos
import { evaluarCredito, topeCredito } from '../../src/lib/credito.js'

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

// ── Tolerancia (tope = floor(límite × (100 + pct) / 100)) ──
assert.equal(creditCapPyg(100_000_000, 10), 110_000_000)
const justo = evaluateCreditSale({ limitPyg: 100_000_000, debtPyg: 0, unpaidPyg: 110_000_000, tolerancePct: 10 })
assert.equal(justo.requiresAuthorization, false, '100M + 10% pasa con 110M')
assert.equal(justo.toleranceUsed, true)
assert.equal(justo.overPyg, 0)
assert.equal(justo.overLimitPyg, 10_000_000)
const pasa1 = evaluateCreditSale({ limitPyg: 100_000_000, debtPyg: 0, unpaidPyg: 110_000_001, tolerancePct: 10 })
assert.equal(pasa1.requiresAuthorization, true, '110.000.001 pide autorización')
assert.equal(pasa1.overPyg, 1)
assert.equal(pasa1.toleranceUsed, false)
// Dentro del límite no se "usa" tolerancia.
assert.equal(evaluateCreditSale({ limitPyg: 100_000_000, debtPyg: 0, unpaidPyg: 100_000_000, tolerancePct: 10 }).toleranceUsed, false)
// La deuda abierta cuenta contra el tope.
assert.equal(evaluateCreditSale({ limitPyg: 100_000_000, debtPyg: 60_000_000, unpaidPyg: 50_000_000, tolerancePct: 10 }).requiresAuthorization, false)
assert.equal(evaluateCreditSale({ limitPyg: 100_000_000, debtPyg: 60_000_000, unpaidPyg: 50_000_001, tolerancePct: 10 }).requiresAuthorization, true)
// Piso en enteros: 1.000.005 × 110 / 100 = 1.100.005,5 → 1.100.005.
assert.equal(creditCapPyg(1_000_005, 10), 1_100_005)
// Sin límite no hay tolerancia que valga; tolerancias fuera de 0/10/20/30 cuentan como 0.
assert.equal(evaluateCreditSale({ limitPyg: 0, debtPyg: 0, unpaidPyg: 1, tolerancePct: 30 }).requiresAuthorization, true)
assert.equal(normalizeTolerancePct(15), 0)
assert.equal(normalizeTolerancePct('20'), 20)
assert.equal(normalizeTolerancePct(-10), 0)
assert.equal(evaluateCreditSale({ limitPyg: 100, debtPyg: 0, unpaidPyg: 111, tolerancePct: 15 }).requiresAuthorization, true)
// Sin tolerancia, todo igual que antes.
assert.equal(evaluateCreditSale({ limitPyg: 2_000_000, debtPyg: 1_500_000, unpaidPyg: 4_850_000 }).overPyg, 4_350_000)

// ── Paridad front/back: misma entrada, mismo resultado ──
const limites = [0, 1, 99, 1_000_005, 2_000_000, 100_000_000, 999_999_999_999]
const deudas = [0, 1, 500_000, 1_500_000, 60_000_000, 110_000_000]
const saldos = [0, 1, 500_000, 500_001, 4_850_000, 50_000_001, 110_000_000, 110_000_001]
const tolerancias = [undefined, 0, 10, 20, 30, 15, -1, '10']
let casos = 0
for (const limitPyg of limites) for (const debtPyg of deudas) for (const unpaidPyg of saldos) for (const tolerancePct of tolerancias) {
  const servidor = evaluateCreditSale({ limitPyg, debtPyg, unpaidPyg, tolerancePct: tolerancePct as number | undefined })
  const front = evaluarCredito({ limite: limitPyg, deuda: debtPyg, saldo: unpaidPyg, tolerancia: tolerancePct })
  const esperado = { limite: servidor.limitPyg, deuda: servidor.debtPyg, saldo: servidor.unpaidPyg, disponible: servidor.availablePyg, tolerancia: servidor.tolerancePct, tope: servidor.capPyg, disponibleTope: servidor.capAvailablePyg, exceso: servidor.overPyg, excesoLimite: servidor.overLimitPyg, usaTolerancia: servidor.toleranceUsed, sinLimite: servidor.noLimit, requiereAutorizacion: servidor.requiresAuthorization }
  assert.deepEqual(front, esperado, `paridad: ${JSON.stringify({ limitPyg, debtPyg, unpaidPyg, tolerancePct })}`)
  casos++
}
for (const limite of limites) for (const pct of tolerancias) assert.equal(topeCredito(limite, pct), creditCapPyg(limite, pct as number))
assert.ok(casos > 1000)

console.log('credit-authorization.test.ts: ok')
