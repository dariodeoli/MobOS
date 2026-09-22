import assert from 'node:assert/strict'
import test from 'node:test'
import { agruparRack, bateriaDe, conCosto, estadoEnRack, filtrarRack, gradoDe, normalizarBusqueda, sinVerificar, verificada } from './tallerRack.js'

// #240 §4: estados del modo taller/rack.

const base = { id: 'u1', serial: 'AUR1', costPyg: 1000000 }

test('sin verificación queda en «por verificar»', () => {
  assert.equal(estadoEnRack(base), 'por-verificar')
  assert.equal(verificada(base), false)
})

test('verificado sin costo queda en «verificado»', () => {
  const unit = { ...base, costPyg: null, originalCost: null, lastVerifiedAt: '2026-09-22T10:00:00Z' }
  assert.equal(conCosto(unit), false)
  assert.equal(estadoEnRack(unit), 'verificado')
})

test('verificado con costo queda «listo» (sin inspección)', () => {
  assert.equal(estadoEnRack({ ...base, verificationCount: 1 }), 'listo')
})

test('con inspección, el grado manda: A + costo = listo; B/C = verificado', () => {
  assert.equal(estadoEnRack({ ...base, inspection: { puntaje: 92, grado: 'A' } }), 'listo')
  assert.equal(estadoEnRack({ ...base, inspection: { puntaje: 80, grado: 'B' } }), 'verificado')
  assert.equal(estadoEnRack({ ...base, inspection: { puntaje: 60, grado: 'C' } }), 'verificado')
  // Grado A sin costo todavía no está listo para vender.
  assert.equal(estadoEnRack({ ...base, costPyg: null, originalCost: null, inspection: { puntaje: 95, grado: 'A' } }), 'verificado')
})

test('lee grado, puntaje y batería de la inspección', () => {
  assert.equal(gradoDe({ inspection: { grado: 'B' } }), 'B')
  assert.equal(gradoDe({ inspection: { grado: 'Z' } }), null)
  assert.equal(gradoDe({}), null)
  assert.equal(bateriaDe({ inspection: { bateriaSalud: '89' } }), 89)
  assert.equal(bateriaDe({ inspection: { bateriaSalud: 120 } }), 100)
  assert.equal(bateriaDe({}), null)
})

test('agrupa y cuenta las unidades sin verificar', () => {
  const units = [
    base,
    { id: 'u2', serial: 'AUR2', costPyg: 500000, verificationCount: 1 },
    { id: 'u3', serial: 'AUR3', costPyg: null, originalCost: null, lastVerifiedAt: '2026-09-22T10:00:00Z' },
  ]
  const grupos = agruparRack(units)
  assert.deepEqual(grupos['por-verificar'].map((u) => u.id), ['u1'])
  assert.deepEqual(grupos.listo.map((u) => u.id), ['u2'])
  assert.deepEqual(grupos.verificado.map((u) => u.id), ['u3'])
  assert.deepEqual(sinVerificar(units).map((u) => u.id), ['u1'])
})

test('filtra por IMEI o modelo (sin acentos ni mayúsculas) y por ubicación', () => {
  const units = [
    { id: 'u1', serial: 'AUR123', product: { name: 'iPhone 15 Pro' }, locationId: 'loc-1' },
    { id: 'u2', serial: 'SAM456', product: { name: 'Samsung S24' }, locationId: 'loc-2' },
  ]
  assert.deepEqual(filtrarRack(units, { busqueda: 'aur12' }).map((u) => u.id), ['u1'])
  assert.deepEqual(filtrarRack(units, { busqueda: 'IPHONE' }).map((u) => u.id), ['u1'])
  assert.deepEqual(filtrarRack(units, { ubicacionId: 'loc-2' }).map((u) => u.id), ['u2'])
  assert.deepEqual(filtrarRack(units, { busqueda: 'samsung', ubicacionId: 'loc-1' }), [])
  assert.equal(normalizarBusqueda('  iPhone 15  '), 'iphone 15')
})
