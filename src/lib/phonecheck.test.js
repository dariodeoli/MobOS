// #240: puntaje y grado del PhoneCheck.
import test from 'node:test'
import assert from 'node:assert/strict'
const { COSMETICOS, INSPECCION_ITEMS, gradoInspection, puntajeInspection, resumenInspection } = await import('./phonecheck.js')

test('puntaje: OK=1, observación=0,5, falla=0 y no aplica no cuenta', () => {
  const items = {}
  for (const item of INSPECCION_ITEMS) items[item.clave] = { estado: 'ok' }
  assert.equal(puntajeInspection({ items }), 100)
  items[INSPECCION_ITEMS[0].clave] = { estado: 'falla' }
  assert.equal(puntajeInspection({ items }), 90, 'una falla sobre 10 ítems = 90')
  items[INSPECCION_ITEMS[1].clave] = { estado: 'observacion' }
  items[INSPECCION_ITEMS[2].clave] = { estado: 'na' }
  // 7 OK + 1 observación + 1 no aplica (no cuenta) + 1 falla = 7,5/9 = 83
  assert.equal(puntajeInspection({ items }), 83)
})

test('grado A/B/C y cosmético del checklist', () => {
  assert.equal(gradoInspection(100), 'A')
  assert.equal(gradoInspection(90), 'A')
  assert.equal(gradoInspection(89), 'B')
  assert.equal(gradoInspection(75), 'B')
  assert.equal(gradoInspection(74), 'C')
  assert.equal(gradoInspection(null), null)
  assert.deepEqual(resumenInspection({ items: {} }), { puntaje: null, grado: null })
  assert.ok(COSMETICOS.includes('marcas de uso'))
})
