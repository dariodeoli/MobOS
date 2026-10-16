import test from 'node:test'
import assert from 'node:assert/strict'
import { elegirUnidadInforme } from '../lib/public-unit'
const units = [
  { tenantId: 'A', serial: 'QA-SERIAL', lastVerifiedAt: new Date('2026-01-01') },
  { tenantId: 'B', serial: 'QA-SERIAL', lastVerifiedAt: new Date('2026-02-01') },
]
test('informe y logo comparten selección; venta ajena no se adhiere a la primera unidad', () => {
  const sale = { serial: 'qa-serial', orderItem: { order: { tenantId: 'B' } } }
  const result = elegirUnidadInforme(units, [sale])
  assert.equal(result?.elegida, units[1])
  assert.equal(result?.venta, sale)
  const foreign = { serial: 'QA-SERIAL', orderItem: { order: { tenantId: 'C' } } }
  assert.equal(elegirUnidadInforme(units, [foreign])?.venta, null)
})
test('sin venta elige verificación más reciente, sin mutar orden ni habilitar unidad inexistente', () => {
  assert.equal(elegirUnidadInforme(units, [])?.elegida, units[1])
  assert.equal(units[0].tenantId, 'A')
  assert.equal(elegirUnidadInforme([], []), null)
})
