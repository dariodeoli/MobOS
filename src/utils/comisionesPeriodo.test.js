import assert from 'node:assert/strict'
import test from 'node:test'
import { diaSiguiente, periodoPendiente } from './comisionesPeriodo.js'

// #83 · Comisiones al día: la liquidación arranca donde terminó el último corte
// del vendedor, sin pisarlo (el servidor rechaza períodos superpuestos).

const corte = (extra = {}) => ({ sellerId: 'v1', status: 'DRAFT', periodFrom: '2026-09-01', periodTo: '2026-09-20', ...extra })
const opciones = { sellerId: 'v1', hoy: '2026-09-24', inicioMes: '2026-09-01' }

test('diaSiguiente: cruza fin de mes y año', () => {
  assert.equal(diaSiguiente('2026-09-20'), '2026-09-21')
  assert.equal(diaSiguiente('2026-09-30'), '2026-10-01')
  assert.equal(diaSiguiente('2026-12-31'), '2027-01-01')
  assert.equal(diaSiguiente(''), '')
})

test('sin cortes, el período pendiente arranca al inicio del mes', () => {
  const pendiente = periodoPendiente([], opciones)
  assert.equal(pendiente.desde, '2026-09-01')
  assert.equal(pendiente.hasta, '2026-09-24')
  assert.equal(pendiente.alDia, false)
  assert.equal(pendiente.ultimo, null)
})

test('con un corte, arranca el día siguiente a su cierre', () => {
  const pendiente = periodoPendiente([corte()], opciones)
  assert.equal(pendiente.desde, '2026-09-21')
  assert.equal(pendiente.alDia, false)
  assert.deepEqual(pendiente.ultimo, { desde: '2026-09-01', to: '2026-09-20' })
})

test('toma el corte más lejano e ignora anuladas y otros vendedores', () => {
  const pendiente = periodoPendiente([
    corte({ periodFrom: '2026-07-01', periodTo: '2026-07-31', status: 'PAID' }),
    corte({ id: 'anulada', status: 'CANCELLED', periodFrom: '2026-09-01', periodTo: '2026-09-10' }),
    corte({ sellerId: 'v2', periodFrom: '2026-09-01', periodTo: '2026-09-23' }),
    corte({ periodFrom: '2026-08-01', periodTo: '2026-08-15' }),
  ], opciones)
  assert.equal(pendiente.desde, '2026-08-16')
})

test('si el último corte llega a hoy, no hay nada pendiente', () => {
  const alDia = periodoPendiente([corte({ periodTo: '2026-09-24' })], opciones)
  assert.equal(alDia.alDia, true)
  assert.equal(alDia.desde, '2026-09-25')
  const cubierto = periodoPendiente([corte({ periodTo: '2026-09-23', status: 'PAID' })], opciones)
  assert.equal(cubierto.alDia, false)
  assert.equal(cubierto.desde, '2026-09-24')
})
