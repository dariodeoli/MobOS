// #240 ítem 7: la valuación de trade-in usa el grado y los hallazgos.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DESCUENTO_MAXIMO_PCT, gradoSugerido, normalizarHallazgos, valuarToma } from './tradeInValuation.js'

test('sin hallazgos ni grado el valor es el base (grado A)', () => {
  const valuacion = valuarToma({ baseValuePyg: 1500000 })
  assert.equal(valuacion.grado, 'A')
  assert.equal(valuacion.valorFinalPyg, 1500000)
  assert.equal(valuacion.totalDescuentoPyg, 0)
  assert.equal(valuacion.descuentos.length, 0)
})

test('el grado y cada hallazgo descuentan con su detalle', () => {
  const valuacion = valuarToma({ baseValuePyg: 1000000, grado: 'C', hallazgos: ['pantalla', 'bateria'] })
  // Grado C 12% + pantalla 18% + batería 10% = 40% → 600.000
  assert.equal(valuacion.totalDescuentoPct, 40)
  assert.equal(valuacion.valorFinalPyg, 600000)
  assert.deepEqual(valuacion.descuentos.map((item) => item.porcentaje), [12, 18, 10])
  assert.equal(valuacion.descuentos[0].montoPyg, 120000)
  assert.match(valuacion.resumen, /Grado C/)
  assert.match(valuacion.resumen, /Pantalla rota o con fallas \(−18%\)/)
})

test('el descuento total se recorta al tope (nunca menos del 30% del base)', () => {
  const valuacion = valuarToma({ baseValuePyg: 1000000, grado: 'D', hallazgos: ['pantalla', 'faceid', 'reparado', 'bateria', 'camaras', 'carcasa'] })
  assert.equal(valuacion.totalDescuentoPct, DESCUENTO_MAXIMO_PCT)
  assert.equal(valuacion.valorFinalPyg, 300000)
  assert.ok(valuacion.descuentos.some((item) => item.recortado))
})

test('el grado se sugiere desde los hallazgos', () => {
  assert.equal(gradoSugerido([]), 'A')
  assert.equal(gradoSugerido(['botones']), 'B')
  assert.equal(gradoSugerido(['pantalla']), 'C')
  assert.equal(gradoSugerido(['camaras', 'audio']), 'C')
  assert.equal(gradoSugerido(['pantalla', 'faceid']), 'D')
  assert.equal(gradoSugerido(['botones', 'audio', 'sensores', 'carcasa']), 'D')
})

test('normaliza hallazgos desde array u objeto de checklist y descarta claves raras', () => {
  assert.deepEqual(normalizarHallazgos(['pantalla', 'pantalla', 'nada']), ['pantalla'])
  assert.deepEqual(normalizarHallazgos({ pantalla: false, camaras: true, bateria: { estado: false } }), ['pantalla', 'bateria'])
  const valuacion = valuarToma({ baseValuePyg: 500000, hallazgos: { pantalla: false } })
  assert.equal(valuacion.grado, 'C')
  assert.equal(valuacion.valorFinalPyg, 350000)
})
