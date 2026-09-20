import assert from 'node:assert/strict'
import test from 'node:test'
import { percentil, promedio, resumenImpresion, seriePorHora, tasaExito, type TrabajoMetrica } from '../lib/print-metrics'

const base = { claimedAt: null, confirmedAt: null, transport: null, queueMs: null, durationMs: null, printerId: 'p1', printerName: 'Caja', destination: 'lan:10.0.0.1:9100', reference: '' }

const trabajo = (extra: Partial<TrabajoMetrica>): TrabajoMetrica => ({
  ...base,
  id: extra.id || 'j',
  state: extra.state || 'ACEPTADO',
  enqueuedAt: extra.enqueuedAt || new Date('2026-09-19T12:00:00.000Z'),
  ...extra,
})

test('promedio y percentil con muestras vacías o impares', () => {
  assert.equal(promedio([]), null)
  assert.equal(promedio([10, 20, 31]), 20)
  assert.equal(percentil([], 95), null)
  assert.equal(percentil([500, 100, 300, 200, 400], 95), 500)
  assert.equal(percentil([100, 200], 95), 200)
  assert.equal(percentil([100], 50), 100)
})

test('tasa de éxito solo con desenlaces y excluye inciertos', () => {
  assert.equal(tasaExito([]), null)
  assert.equal(tasaExito([trabajo({ state: 'INCIERTO' })]), null)
  assert.equal(tasaExito([trabajo({ state: 'ACEPTADO' }), trabajo({ state: 'FALLIDO' })]), 50)
  assert.equal(tasaExito([trabajo({ state: 'CONFIRMADO' }), trabajo({ state: 'CONFIRMADO' })]), 100)
})

test('la serie horaria cubre los huecos del rango', () => {
  const serie = seriePorHora(
    [trabajo({ enqueuedAt: new Date('2026-09-19T12:30:00.000Z'), durationMs: 2000 })],
    new Date('2026-09-19T11:10:00.000Z'),
    new Date('2026-09-19T13:05:00.000Z'),
  )
  assert.deepEqual(serie.map(bucket => [bucket.hora, bucket.trabajos]), [
    ['2026-09-19T11:00:00.000Z', 0],
    ['2026-09-19T12:00:00.000Z', 1],
    ['2026-09-19T13:00:00.000Z', 0],
  ])
  assert.equal(serie[1].promedioDurationMs, 2000)
  assert.equal(serie[0].promedioDurationMs, null)
})

test('resumen: totales, p95 global y por impresora', () => {
  const resumen = resumenImpresion([
    trabajo({ id: 'a', enqueuedAt: new Date('2026-09-19T12:00:00.000Z'), durationMs: 1000, queueMs: 200 }),
    trabajo({ id: 'b', enqueuedAt: new Date('2026-09-19T12:05:00.000Z'), durationMs: 3000, queueMs: 400 }),
    trabajo({ id: 'c', enqueuedAt: new Date('2026-09-19T12:10:00.000Z'), durationMs: 2000, printerId: 'p2', printerName: 'Mostrador' }),
    trabajo({ id: 'd', state: 'FALLIDO', enqueuedAt: new Date('2026-09-19T12:15:00.000Z'), durationMs: 500 }),
    trabajo({ id: 'e', state: 'PENDIENTE', printerId: null, printerName: null, enqueuedAt: new Date('2026-09-19T12:20:00.000Z') }),
  ], new Date('2026-09-19T12:00:00.000Z'), new Date('2026-09-19T13:00:00.000Z'))
  assert.deepEqual(resumen.totales, { trabajos: 5, exitosos: 3, fallos: 1, inciertos: 0, enCola: 1, tasaExito: 75 })
  assert.equal(resumen.latencias.global.promedioDurationMs, 1625)
  assert.equal(resumen.latencias.global.p95DurationMs, 3000)
  assert.equal(resumen.latencias.porImpresora.length, 3, 'incluye el grupo sin impresora')
  const caja = resumen.latencias.porImpresora.find(grupo => grupo.printerId === 'p1')
  assert.equal(caja?.trabajos, 3)
  assert.equal(caja?.promedioQueueMs, 300)
  assert.equal(resumen.ultimos[0].id, 'e', 'los últimos salen del más nuevo al más viejo')
  assert.equal(resumen.ultimos.length, 5)
})

console.log('print-metrics: 4 casos OK')
