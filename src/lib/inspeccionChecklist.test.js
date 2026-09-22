import assert from 'node:assert/strict'
import test from 'node:test'
import { SECCIONES_INSPECCION, resumenChecklist, valorInicialChecklist } from './inspeccionChecklist.js'

test('el checklist arranca vacío y con todas las secciones del catálogo', () => {
  const valor = valorInicialChecklist()
  const total = SECCIONES_INSPECCION.flatMap((s) => s.items).length
  assert.equal(Object.keys(valor.items).length, total)
  assert.ok(Object.values(valor.items).every((estado) => estado === ''))
  assert.equal(resumenChecklist(valor).grado, '')
  assert.equal(resumenChecklist(valor).progreso, 0)
})

test('puntaje y grado: A sin fallas, B con falla menor, C con falla clave o batería baja', () => {
  const base = valorInicialChecklist()
  const todos = Object.keys(base.items)
  const pasarTodo = { ...base, bateriaSalud: '92', items: Object.fromEntries(todos.map((id) => [id, 'pasa'])) }
  assert.equal(resumenChecklist(pasarTodo).grado, 'A')
  assert.equal(resumenChecklist(pasarTodo).porcentaje, 100)

  const fallaMenor = { ...pasarTodo, items: { ...pasarTodo.items, vibracion: 'falla' } }
  assert.equal(resumenChecklist(fallaMenor).grado, 'B')
  assert.equal(resumenChecklist(fallaMenor).fallan, 1)

  const fallaClave = { ...pasarTodo, items: { ...pasarTodo.items, tactil: 'falla' } }
  assert.equal(resumenChecklist(fallaClave).grado, 'C')

  const bateriaBaja = { ...pasarTodo, bateriaSalud: '78' }
  assert.equal(resumenChecklist(bateriaBaja).grado, 'C')
  assert.equal(resumenChecklist(bateriaBaja).saludBateria, 78)
})

test('lo no revisado no puntúa y N/A no baja el puntaje', () => {
  const base = valorInicialChecklist()
  const parcial = { ...base, items: { ...base.items, tactil: 'pasa', vibracion: 'na' } }
  const resumen = resumenChecklist(parcial)
  assert.equal(resumen.revisados, 2)
  assert.equal(resumen.porcentaje, 100, 'pasa / (pasa + falla): N/A no aplica')
  assert.equal(resumen.grado, '', 'sin revisar todo no hay grado')
})
