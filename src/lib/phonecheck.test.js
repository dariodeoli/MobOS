// #240: puntaje y grado del PhoneCheck.
import test from 'node:test'
import assert from 'node:assert/strict'
const { COSMETICOS, INSPECCION_ITEMS, gradoInspection, locksDeVerificacion, payloadInformeInspection, puntajeInspection, resumenInspection } = await import('./phonecheck.js')

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

test('locks y payload del informe quedan listos para DSN/PRN (#240)', () => {
  const verificacion = { etiqueta: 'Verificado', resolvedAt: '2026-09-22T10:00:00.000Z', campos: [
    { clave: 'findMy', valor: 'Off' }, { clave: 'mdm', valor: 'On' }, { clave: 'blacklist', valor: 'Sin reportes actuales' }, { clave: 'simLock', valor: 'Unlocked' },
  ] }
  const chips = locksDeVerificacion(verificacion)
  assert.equal(chips.find(chip => chip.clave === 'icloud').ok, true)
  assert.equal(chips.find(chip => chip.clave === 'mdm').ok, false)
  assert.equal(chips.find(chip => chip.clave === 'esn').ok, true)
  assert.equal(chips.find(chip => chip.clave === 'carrier').ok, true)
  const items = {}
  for (const item of INSPECCION_ITEMS) items[item.clave] = { estado: 'ok' }
  const payload = payloadInformeInspection({ unit: { id: 'u1', serial: 'AUR1', batteryHealth: 88, product: { name: 'iPhone 15', capacity: '128GB' }, condition: 'USED' }, inspection: { items, cosmetico: 'buen estado', bateriaPct: '87', bateriaCiclos: '310' }, verificacion })
  assert.equal(payload.puntaje, 100)
  assert.equal(payload.grado, 'A')
  assert.equal(payload.bateria.porcentaje, '87')
  assert.equal(payload.bateria.ciclos, '310')
  assert.equal(payload.locks.length, 4)
  assert.equal(payload.fuenteVerificacion.proveedor, 'imeicheck.net')
  assert.equal(payload.items.length, INSPECCION_ITEMS.length)
})
