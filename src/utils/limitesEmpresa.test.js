import assert from 'node:assert/strict'
import test from 'node:test'
import { validarEnteroNoNegativo, validarPorcentajeDecimal, validarPorcentajeEntero } from './limitesEmpresa.js'

// #162 · Seguro y límites de la empresa: la pantalla valida con estas reglas
// antes de llamar al API (mismas que el backend) y muestra el error en el grupo.

test('porcentaje entero: acepta enteros y vacío, y explica los decimales', () => {
  assert.deepEqual(validarPorcentajeEntero('25'), { ok: true, valor: 25 })
  assert.deepEqual(validarPorcentajeEntero('0'), { ok: true, valor: 0 })
  assert.deepEqual(validarPorcentajeEntero(''), { ok: true, valor: null })
  assert.deepEqual(validarPorcentajeEntero('  '), { ok: true, valor: null })
  assert.equal(validarPorcentajeEntero('25,5').ok, false)
  assert.match(validarPorcentajeEntero('25,5', 'El seguro').error, /El seguro se guarda sin decimales/)
  assert.match(validarPorcentajeEntero('101').error, /entre 0 y 100/)
  assert.match(validarPorcentajeEntero('-1').error, /entre 0 y 100/)
  assert.match(validarPorcentajeEntero('abc').error, /entre 0 y 100/)
})

test('porcentaje decimal: hasta 2 decimales (la mora)', () => {
  assert.deepEqual(validarPorcentajeDecimal('0,5'), { ok: true, valor: 0.5 })
  assert.deepEqual(validarPorcentajeDecimal('12,25'), { ok: true, valor: 12.25 })
  assert.deepEqual(validarPorcentajeDecimal(''), { ok: true, valor: null })
  assert.match(validarPorcentajeDecimal('12,255').error, /hasta 2 decimales/)
  assert.match(validarPorcentajeDecimal('120').error, /entre 0 y 100/)
})

test('entero no negativo: acepta números del campo y rechaza lo inválido', () => {
  assert.deepEqual(validarEnteroNoNegativo(2000000, 'El límite de gasto'), { ok: true, valor: 2000000 })
  assert.deepEqual(validarEnteroNoNegativo('1.234.567', 'El límite de gasto'), { ok: true, valor: 1234567 })
  assert.deepEqual(validarEnteroNoNegativo('', 'El límite de gasto'), { ok: true, valor: 0 })
  assert.equal(validarEnteroNoNegativo(2.5, 'El límite de gasto').ok, false)
  assert.equal(validarEnteroNoNegativo(-10, 'El límite de gasto').ok, false)
})
