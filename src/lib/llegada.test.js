import test from 'node:test'
import assert from 'node:assert/strict'
import { agruparPorBloque, arreglosDe, condicionFila, etiquetasDeLlegada, imeiConfirmable, luhnValido, puedeConfirmar } from './llegada.js'

test('condición de la fila por destino y pre-venta', () => {
  assert.equal(condicionFila({ destination: 'STOCK', match: 'EXACTO' }), 'stock')
  assert.equal(condicionFila({ destination: 'STOCK', match: 'EXACTO', customerId: 'c1' }), 'preVendido')
  assert.equal(condicionFila({ destination: 'OTRA_SUCURSAL', match: 'EXACTO' }), 'otra')
  assert.equal(condicionFila({ destination: 'STOCK', match: 'NO_LLEGO' }), 'noLlego')
  assert.equal(condicionFila({ destination: 'FALTA_IMEI', match: 'SOBRANTE' }), 'faltaImei')
})

test('«el IMEI es correcto» solo con 15 dígitos terminados en 000 y Luhn', () => {
  assert.ok(luhnValido('352793100006000'))
  assert.ok(imeiConfirmable('352793100006000'))
  assert.ok(!imeiConfirmable('352793000000000'))
  assert.ok(!imeiConfirmable('3,52793E+14'))
  assert.ok(!imeiConfirmable('490154203237518'))
})

test('agrupa por bloque de fecha en el orden pegado', () => {
  const grupos = agruparPorBloque([
    { raw: { blockDate: '2026-10-12', blockLabel: '12/10/2026' } },
    { raw: { blockDate: '2026-10-12', blockLabel: '12/10/2026' } },
    { raw: { blockDate: '2026-10-07', blockLabel: '07/10/2026 · VOS PEDÍS' } },
  ])
  assert.deepEqual(grupos.map((g) => g.lineas.length), [2, 1])
  assert.equal(grupos[1].etiqueta, '07/10/2026 · VOS PEDÍS')
})

test('cada hallazgo apunta a su arreglo y confirmar exige cero errores', () => {
  const linea = { issues: [{ code: 'ELEGIR_PRODUCTO', severity: 'error' }, { code: 'IMEI_EXCEL', severity: 'error' }, { code: 'COSTO_FALTA', severity: 'warning' }] }
  assert.deepEqual(arreglosDe(linea), ['producto', 'serial'])
  assert.equal(puedeConfirmar({ status: 'BORRADOR', lines: [{}], summary: { errores: 1 } }), false)
  assert.equal(puedeConfirmar({ status: 'BORRADOR', lines: [{}], summary: { errores: 0 } }), true)
  assert.equal(puedeConfirmar({ status: 'CONFIRMADA', lines: [{}], summary: { errores: 0 } }), false)
})

test('las etiquetas salen solo de lo que ingresó con serie', () => {
  const lista = etiquetasDeLlegada([
    { serial: 'A1', match: 'EXACTO', destination: 'STOCK', raw: { modelText: 'X' } },
    { serial: 'A2', match: 'EXACTO', destination: 'DEVOLVER' },
    { serial: null, match: 'EXACTO', destination: 'FALTA_IMEI' },
  ], 'LLG-1')
  assert.equal(lista.length, 1)
  assert.equal(lista[0].imei, 'A1')
})
