import assert from 'node:assert/strict'
import test from 'node:test'
import { consultaLista, diaCorto, formatDelta, formatDuracion, periodoValido, puntosSparkline, totalPaginas } from './formato.js'

test('formatDelta: signo, coma decimal y «sin base» cuando el período anterior es 0', () => {
  assert.deepEqual(formatDelta(12.5), { texto: '+12,5 %', tono: 'sube' })
  assert.deepEqual(formatDelta(-3), { texto: '−3 %', tono: 'baja' })
  assert.deepEqual(formatDelta(0), { texto: '0 %', tono: 'neutro' })
  assert.deepEqual(formatDelta(null), { texto: 'sin base previa', tono: 'neutro' })
})

test('puntosSparkline: sin datos no dibuja nada; con datos devuelve un punto por día', () => {
  assert.equal(puntosSparkline([]), null)
  assert.equal(puntosSparkline([{ valor: 0 }, { valor: 0 }, { valor: 0 }]), null)
  const puntos = puntosSparkline([{ valor: 1 }, { valor: 5 }, { valor: 3 }]).split(' ')
  assert.equal(puntos.length, 3)
  const ys = puntos.map(p => Number(p.split(',')[1]))
  assert.ok(ys[1] < ys[0] && ys[1] < ys[2], 'el máximo queda más arriba')
})

test('periodoValido cae al default; diaCorto y paginación', () => {
  assert.equal(periodoValido('mes-anterior'), 'mes-anterior')
  assert.equal(periodoValido('x'), '30')
  assert.equal(diaCorto('2026-10-14'), '14/10')
  assert.equal(diaCorto('mal'), '')
  assert.equal(totalPaginas(0), 1)
  assert.equal(totalPaginas(61), 3)
  assert.equal(consultaLista({ q: 'a b', estado: '', pagina: 2 }), 'q=a+b&pagina=2')
})

test('formatDuracion: segundos y minutos; inválidos con guion', () => {
  assert.equal(formatDuracion(45), '45 s')
  assert.equal(formatDuracion(125), '2 min 05 s')
  assert.equal(formatDuracion(null), '0 s')
  assert.equal(formatDuracion(-1), '—')
  assert.equal(formatDuracion('x'), '—')
})
