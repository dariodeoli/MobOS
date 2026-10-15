import test from 'node:test'
import assert from 'node:assert/strict'
import { cargarPedidosParaAnalisis } from './posAnalyticsPedidos.js'

test('ventas del día incluye pedidos posteriores a la primera página y usa el cursor', async () => {
  const llamadas = []
  const primera = Array.from({ length: 500 }, (_, i) => ({ id: `o${i}`, createdAt: '2026-10-15T15:00:00Z' }))
  const segunda = [{ id: 'o500', createdAt: '2026-10-15T14:00:00Z' }, { id: 'vieja', createdAt: '2026-10-01T14:00:00Z' }]
  const filas = await cargarPedidosParaAnalisis(async url => { llamadas.push(url); return llamadas.length === 1 ? primera : segunda }, '2026-10-14')
  assert.equal(filas.length, 501)
  assert.equal(new URL(llamadas[1], 'https://test.invalid').searchParams.get('cursor'), 'o499')
})

test('se detiene cuando la página ya pasó el período y propaga fallos', async () => {
  let llamadas = 0
  const filas = await cargarPedidosParaAnalisis(async () => { llamadas++; return Array.from({ length: 500 }, (_, i) => ({ id: `o${i}`, createdAt: '2026-10-01T14:00:00Z' })) }, '2026-10-14')
  assert.equal(llamadas, 1)
  assert.deepEqual(filas, [])
  await assert.rejects(cargarPedidosParaAnalisis(async () => { throw new Error('Sin conexión') }, '2026-10-14'), /Sin conexión/)
})
