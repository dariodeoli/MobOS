import assert from 'node:assert/strict'
import test from 'node:test'
import { classifySerialInput, costPygOf, redactSummary, summarizeArrival, supplierView, type SummaryLine } from '../lib/arrival-summary'

// #408 unidad E · piezas puras de la llegada: resumen, costos y redacción.
const line = (over: Partial<SummaryLine>): SummaryLine => ({ match: 'EXACTO', destination: 'STOCK', serial: 'X', costPyg: 7500, originalCost: 1, issues: [], ...over })

test('resumen: cuenta por destino, pre-vendidos y no llegó; el costo excluye devueltos y faltantes', () => {
  const s = summarizeArrival([
    line({}),
    line({ orderItemId: 'oi', costPyg: 15000, originalCost: 2 }),
    line({ customerId: 'c' }),
    line({ destination: 'OTRA_SUCURSAL' }),
    line({ destination: 'TECNICO' }),
    line({ destination: 'DEVOLVER', costPyg: 99000, originalCost: 13.2 }),
    line({ destination: 'FALTA_IMEI', serial: null }),
    line({ match: 'NO_LLEGO', costPyg: 500, originalCost: 1 }),
    line({ match: 'SOBRANTE', issues: [{ code: 'SOBRANTE', severity: 'warning', message: 'x' }] }),
  ], 'USD')
  assert.equal(s.ingresaron, 2)
  assert.equal(s.preVendidos, 2)
  assert.equal(s.aOtraSucursal, 1)
  assert.equal(s.tecnico, 1)
  assert.equal(s.devueltos, 1)
  assert.equal(s.faltaImei, 1)
  assert.equal(s.noLlegaron, 1)
  assert.equal(s.sobrantes, 1)
  assert.equal(s.avisos, 1)
  assert.equal(s.costPyg, 7500 + 15000 + 7500 + 7500 + 7500 + 7500)
  assert.equal(s.costUsd, 7)
  assert.equal(s.devueltoPyg, 99000)
})

test('resumen sin permiso de costos: no sale ningún monto', () => {
  const s = summarizeArrival([line({})], 'USD')
  const sin = redactSummary(s, false) as unknown as Record<string, unknown>
  assert.ok(!('costPyg' in sin) && !('costUsd' in sin) && !('devueltoPyg' in sin))
  assert.equal(sin.ingresaron, 1)
  assert.equal(redactSummary(s, true), s)
})

test('costo en Gs: USD por cotización o Gs directo; sin cotización no inventa', () => {
  assert.equal(costPygOf('USD', 1485, 7500), 11137500)
  assert.equal(costPygOf('USD', 10, null), null)
  assert.equal(costPygOf('PYG', 4500000, null), 4500000)
  assert.equal(costPygOf('PYG', null, null), null)
})

test('serie: IMEI Luhn, serie alfanumérica y rechazo del IMEI perdido por Excel', () => {
  assert.deepEqual(classifySerialInput('490154203237518'), { kind: 'IMEI', value: '490154203237518' })
  assert.equal(classifySerialInput('490154203237519').kind, 'INVALIDO')
  assert.equal(classifySerialInput('352793000000000').kind, 'INVALIDO')
  assert.deepEqual(classifySerialInput('sltw kf47rwl'), { kind: 'SERIE', value: 'SLTWKF47RWL' })
  assert.equal(classifySerialInput('12345').kind, 'INVALIDO')
})

test('proveedor: sigla para quien no ve el nombre, nunca el nombre real', () => {
  const supplier = { id: 's1', name: 'Mayorista Secreto', code: 'MS', icon: null, color: null }
  assert.deepEqual(supplierView(supplier, false), { id: 's1', code: 'MS' })
  assert.equal(supplierView(supplier, true)?.name, 'Mayorista Secreto')
  assert.equal(supplierView({ ...supplier, code: null }, false)?.code, 'S/S')
  assert.equal(supplierView(null, false), null)
})
