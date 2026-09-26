import assert from 'node:assert/strict'
import test from 'node:test'
import { analizarSerial, luhnValido, normalizarSerial, validarLote } from './escanerSeriales.js'

// IMEI de prueba con dígito verificador correcto (base 49015420323751 → 8).
const IMEI_VALIDO = '490154203237518'
const IMEI_ROTO = '490154203237519'

test('normaliza (trim, mayúsculas y tope de 64) y Luhn solo aplica a 15 dígitos', () => {
  assert.equal(normalizarSerial('  ab-12  '), 'AB-12')
  assert.equal(normalizarSerial('x'.repeat(80)).length, 64)
  assert.equal(luhnValido(IMEI_VALIDO), true)
  assert.equal(luhnValido(IMEI_ROTO), false)
  assert.equal(luhnValido('AUR0001'), true, 'un serial corto no es IMEI: no aplica Luhn')
  assert.equal(luhnValido('12345678901234'), true, '14 dígitos tampoco')
})

test('analizarSerial clasifica vacío, Luhn y formato', () => {
  assert.equal(analizarSerial('   ').motivo, 'VACIO')
  assert.equal(analizarSerial(IMEI_ROTO).motivo, 'LUHN')
  assert.equal(analizarSerial('AB').motivo, 'FORMATO')
  assert.deepEqual(analizarSerial(IMEI_VALIDO), { ok: true, serial: IMEI_VALIDO })
  assert.deepEqual(analizarSerial(' aur-0001 '), { ok: true, serial: 'AUR-0001' })
})

test('valida el lote: repetidos, ya cargados, límite y permitidos', () => {
  const lote = validarLote({
    entradas: `AUR-1, AUR-1\nAUR-2;AUR-3`,
    yaCargados: ['AUR-3'],
    limite: 2,
  })
  assert.deepEqual(lote.validos, ['AUR-1', 'AUR-2'])
  assert.deepEqual(lote.errores, [
    { serial: 'AUR-1', motivo: 'REPETIDO' },
    { serial: 'AUR-3', motivo: 'YA_CARGADO' },
  ])

  const conLimite = validarLote({ entradas: ['AUR-1', 'AUR-2'], limite: 1 })
  assert.deepEqual(conLimite.validos, ['AUR-1'])
  assert.deepEqual(conLimite.errores, [{ serial: 'AUR-2', motivo: 'EXCEDE' }])

  const manifiesto = validarLote({ entradas: [IMEI_VALIDO, 'SOBRANTE-1'], permitidos: new Set([IMEI_VALIDO]) })
  assert.deepEqual(manifiesto.validos, [IMEI_VALIDO], 'sin permitidos, el resto se marca desconocido')
  assert.deepEqual(manifiesto.errores, [{ serial: 'SOBRANTE-1', motivo: 'DESCONOCIDO' }])
})

test('un IMEI con un dígito cambiado se rechaza entero', () => {
  const lote = validarLote({ entradas: [IMEI_VALIDO, IMEI_ROTO] })
  assert.deepEqual(lote.validos, [IMEI_VALIDO])
  assert.deepEqual(lote.errores, [{ serial: IMEI_ROTO, motivo: 'LUHN' }])
})
