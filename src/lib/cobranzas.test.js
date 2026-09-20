import assert from 'node:assert/strict'
import test from 'node:test'
import { agruparCuotas, calcularRecargoPyg, diasDeAtraso, esVencida, resumenCuotas } from './cobranzas.js'

const DIA = 86400000
const AHORA = new Date('2026-09-20T12:00:00.000Z')

test('días de atraso: vencida, justo en el límite, futura y fecha inválida', () => {
  assert.equal(diasDeAtraso(new Date(AHORA.getTime() - 3 * DIA), AHORA), 3)
  // Justo en el límite: 23 h después del vencimiento todavía son 0 días.
  assert.equal(diasDeAtraso(new Date(AHORA.getTime() - DIA + 3600000), AHORA), 0)
  assert.equal(diasDeAtraso(new Date(AHORA.getTime() + DIA), AHORA), 0)
  assert.equal(diasDeAtraso(null, AHORA), 0)
  assert.equal(diasDeAtraso('no-es-fecha', AHORA), 0)
  assert.equal(esVencida(new Date(AHORA.getTime()), AHORA), true)
  assert.equal(esVencida(new Date(AHORA.getTime() + 1000), AHORA), false)
  assert.equal(esVencida('', AHORA), false)
})

test('recargo por mora: sin tasa o sin atraso es cero, con tope del 20 %', () => {
  assert.equal(calcularRecargoPyg({ amountPyg: 100000, diasAtraso: 10, bpPorDia: 0 }), 0)
  assert.equal(calcularRecargoPyg({ amountPyg: 100000, diasAtraso: 0, bpPorDia: 50 }), 0)
  assert.equal(calcularRecargoPyg({ amountPyg: 100000, diasAtraso: 10, bpPorDia: 10 }), 1000)
  // 100 bp diarios (1 %) por 30 días toca el techo del 20 %.
  assert.equal(calcularRecargoPyg({ amountPyg: 100000, diasAtraso: 30, bpPorDia: 100 }), 20000)
  // Sin monto no hay recargo.
  assert.equal(calcularRecargoPyg({ amountPyg: 0, diasAtraso: 30, bpPorDia: 100 }), 0)
})

test('agrupa vencidas primero y descarta filas sin fecha válida', () => {
  const rows = [
    { id: 'a', dueAt: new Date(AHORA.getTime() + 2 * DIA).toISOString(), tipo: 'PROXIMA' },
    { id: 'b', dueAt: new Date(AHORA.getTime() - 5 * DIA).toISOString(), tipo: 'VENCIDA' },
    { id: 'c', dueAt: new Date(AHORA.getTime() - 1 * DIA).toISOString(), tipo: 'VENCIDA' },
    { id: 'd', dueAt: 'no-es-fecha', tipo: 'PROXIMA' },
  ]
  const { vencidas, proximas } = agruparCuotas(rows, AHORA)
  assert.deepEqual(vencidas.map((row) => row.id), ['b', 'c'])
  assert.deepEqual(proximas.map((row) => row.id), ['a'])
  assert.deepEqual(agruparCuotas(null, AHORA), { vencidas: [], proximas: [] })
})

test('resumen suma pendiente, recargo y avisa las cuotas sin teléfono', () => {
  const resumen = resumenCuotas([
    { saldoPendientePyg: 40000, recargoPyg: 1000, whatsappUrl: 'https://wa.me/595981' },
    { saldoPendientePyg: 60000, recargoPyg: 0, whatsappUrl: null },
    null,
  ])
  assert.deepEqual(resumen, { pendientePyg: 100000, recargoPyg: 1000, total: 2, sinTelefono: 1 })
})
