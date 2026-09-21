import assert from 'node:assert/strict'
import test from 'node:test'
import { consultaKardex, extremosDelRango } from './kardex.js'

test('arma los extremos del día local en ISO', () => {
  const rango = extremosDelRango('2026-09-01', '2026-09-30')
  const inicio = new Date(rango.desde)
  const fin = new Date(rango.hasta)
  assert.equal(inicio.getFullYear(), 2026)
  assert.equal(inicio.getMonth(), 8)
  assert.equal(inicio.getDate(), 1)
  assert.equal(inicio.getHours(), 0)
  assert.equal(fin.getDate(), 30)
  assert.equal(fin.getHours(), 23)
  assert.deepEqual(extremosDelRango('', ''), { desde: undefined, hasta: undefined })
  assert.deepEqual(extremosDelRango('no-es-fecha', ''), { desde: undefined, hasta: undefined })
})

test('arma la consulta del kardex con y sin rango', () => {
  assert.equal(consultaKardex('abc', {}), '/api/products/abc/kardex')
  const conRango = consultaKardex('abc/d', { desde: '2026-09-01T03:00:00.000Z' }, { format: 'csv' })
  assert.ok(conRango.startsWith('/api/products/abc%2Fd/kardex?'))
  assert.match(conRango, /desde=2026-09-01T03%3A00%3A00\.000Z/)
  assert.match(conRango, /format=csv/)
})
