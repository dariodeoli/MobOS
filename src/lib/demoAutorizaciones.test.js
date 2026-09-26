import assert from 'node:assert/strict'
import test from 'node:test'
import { DEMO_AUTORIZACIONES, demoAutorizacionesFiltradas } from './demoAutorizaciones.js'

// #213: la demo muestra autorizaciones completas (pendientes y resueltas) con
// datos ficticios marcados como demo.
test('la demo trae autorizaciones ficticias completas (#213)', () => {
  assert.ok(DEMO_AUTORIZACIONES.length >= 4, 'hay pendientes y resueltas')
  assert.equal(DEMO_AUTORIZACIONES.filter((fila) => fila.status === 'PENDING').length, 2)
  const tipos = [...new Set(DEMO_AUTORIZACIONES.map((fila) => fila.kind))].sort()
  assert.deepEqual(tipos, ['BELOW_LIST_PRICE', 'CREDIT', 'DISCOUNT', 'WHOLESALE'])
  for (const fila of DEMO_AUTORIZACIONES) {
    assert.ok(fila.id.startsWith('demo-'), `${fila.id} es ficticia`)
    assert.ok(fila.customer?.name, `${fila.id} tiene cliente`)
    assert.ok(fila.requestedBy?.name, `${fila.id} tiene solicitante`)
    assert.ok(!Number.isNaN(Date.parse(fila.createdAt)), `${fila.id} tiene fecha válida`)
  }
})

test('los filtros de la demo salen del dataset (#213)', () => {
  assert.equal(demoAutorizacionesFiltradas().length, DEMO_AUTORIZACIONES.length)
  assert.equal(demoAutorizacionesFiltradas('PENDING').length, 2)
  assert.equal(demoAutorizacionesFiltradas('APPROVED').length, 1)
  assert.equal(demoAutorizacionesFiltradas('', 'CREDIT').length, 1)
  assert.equal(demoAutorizacionesFiltradas('PENDING', 'CREDIT').length, 1)
  assert.equal(demoAutorizacionesFiltradas('REJECTED', 'CREDIT').length, 0)
})
