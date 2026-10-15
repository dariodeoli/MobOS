import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluarConciliacionDia, diaParaguay } from './conciliacionDia.js'
const cash = { id: 'a', method: 'CASH', accountId: null, currency: 'PYG', amountPyg: 100000, status: 'CONFIRMED' }
const receipt = receivedPyg => ({ method: 'CASH', accountId: null, currency: 'PYG', receivedPyg })
test('declaración independiente: pendiente sin dato, verde al coincidir y rojo tras cambiar el cobro', () => {
  assert.equal(evaluarConciliacionDia([cash]).state, 'PENDING')
  assert.equal(evaluarConciliacionDia([cash], [receipt(100000)]).state, 'VERIFIED')
  assert.equal(evaluarConciliacionDia([{ ...cash, amountPyg: 80000 }], [receipt(100000)]).state, 'DIFFERENCE')
})
test('diferencias opuestas mantienen rojo aunque el neto sea cero; no cuenta pendientes', () => {
  const other = { ...cash, id: 'b', method: 'TRANSFER', accountId: 'bank' }
  const result = evaluarConciliacionDia([cash, other, { ...cash, id: 'driver', status: 'PENDING' }], [receipt(90000), { ...other, receivedPyg: 110000 }])
  assert.equal(result.expectedPyg, 200000); assert.equal(result.differencePyg, 0); assert.equal(result.state, 'DIFFERENCE')
})
test('día usa Paraguay aunque el navegador o UTC ya estén en otra fecha', () => {
  assert.equal(diaParaguay('2026-10-16T02:59:59Z'), '2026-10-15')
  assert.equal(diaParaguay('2026-10-16T03:00:00Z'), '2026-10-16')
})
