import assert from 'node:assert/strict'
import test from 'node:test'
import { CHECKLISTS, ESTADO_FISICO, PRUEBAS_EJECUTADAS, TIPOS_EQUIPO, patronValido, puntosDeTipo } from './servicioChecklist.js'

test('cada tipo de equipo tiene su checklist sin claves repetidas', () => {
  for (const tipo of TIPOS_EQUIPO) {
    const puntos = CHECKLISTS[tipo]
    assert.ok(Array.isArray(puntos) && puntos.length >= 3, `${tipo} sin checklist`)
    assert.equal(new Set(puntos).size, puntos.length, `${tipo} tiene claves repetidas`)
  }
})

test('el iPhone moderno cubre los puntos de la hoja de recepción', () => {
  const puntos = CHECKLISTS.iPhone
  for (const punto of ['Cámara frontal', 'Sensor de proximidad / Face ID', 'Volumen', 'Pantalla', 'Home / Touch ID', 'Micrófono / Audífono', 'Conector de carga', 'Altavoz', 'Cámara posterior', 'Flash', 'Botón de encendido', 'Enciende']) {
    assert.ok(puntos.includes(punto), `falta ${punto}`)
  }
})

test('el Apple Watch cubre sus puntos propios', () => {
  const puntos = CHECKLISTS['Apple Watch']
  for (const punto of ['Digital Crown', 'Micrófono', 'Botón lateral', 'Sensor cardíaco eléctrico', 'Bocina / salida de aire']) {
    assert.ok(puntos.includes(punto), `falta ${punto}`)
  }
})

test('un tipo desconocido cae en Otros', () => {
  assert.deepEqual(puntosDeTipo('Nokia'), CHECKLISTS.Otros)
})

test('estado físico y pruebas ejecutadas no tienen repetidos', () => {
  assert.equal(new Set(ESTADO_FISICO).size, ESTADO_FISICO.length)
  assert.equal(new Set(PRUEBAS_EJECUTADAS).size, PRUEBAS_EJECUTADAS.length)
})

test('el patrón solo acepta puntos del 1 al 9', () => {
  assert.deepEqual(patronValido([1, 2, 5, 9]), [1, 2, 5, 9])
  assert.deepEqual(patronValido([0, 10, 3]), [3])
  assert.deepEqual(patronValido('123'), [])
  assert.deepEqual(patronValido(null), [])
})
