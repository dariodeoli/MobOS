import assert from 'node:assert/strict'
import { gradoInspection, itemsLista, normalizarInspectionItems, puntajeInspection, resumenInspection } from '../lib/inspection'

// ── La UI manda el checklist por clave: se conserva tal cual ────────────────
const ui = normalizarInspectionItems({ pantalla: { estado: 'ok', nota: 'impecable' }, camaras: { estado: 'observacion' } })
assert.deepEqual(ui, { pantalla: { estado: 'ok', nota: 'impecable' }, camaras: { estado: 'observacion' } })
// Puntaje: (1 + 0,5) / 2 = 75 ⇒ grado B.
assert.deepEqual(resumenInspection(ui), { puntaje: 75, grado: 'B' })

// ── Histórico con lista: se normaliza al objeto por clave ───────────────────
const lista = normalizarInspectionItems([
  { clave: 'pantalla', estado: 'ok', nota: '' },
  { clave: 'bateria', estado: 'falla', nota: 'hinchada' },
  { clave: '', estado: 'ok' },
  null,
  'basura',
])
assert.deepEqual(lista, { pantalla: { estado: 'ok', nota: '' }, bateria: { estado: 'falla', nota: 'hinchada' } })

// ── Valores raros: se limpian sin romper ────────────────────────────────────
assert.deepEqual(normalizarInspectionItems(null), {})
assert.deepEqual(normalizarInspectionItems([{ clave: 'x', estado: null, nota: 42 }]), { x: { nota: '42' } })
assert.deepEqual(normalizarInspectionItems({ x: 'ok' }), { x: {} })

// ── Puntaje y grado con la regla de la UI ───────────────────────────────────
assert.equal(puntajeInspection({}), null, 'sin ítems no hay puntaje')
assert.equal(puntajeInspection({ a: { estado: 'na' } }), null, 'N/A no cuenta')
assert.equal(puntajeInspection({ a: { estado: 'ok' }, b: { estado: 'ok' }, c: { estado: 'na' } }), 100)
assert.equal(puntajeInspection({ a: { estado: 'falla' } }), 0)
assert.equal(gradoInspection(100), 'A')
assert.equal(gradoInspection(90), 'A')
assert.equal(gradoInspection(89), 'B')
assert.equal(gradoInspection(75), 'B')
assert.equal(gradoInspection(74), 'C')
assert.equal(gradoInspection(null), null)

// ── Lista derivada para el informe impreso ──────────────────────────────────
assert.deepEqual(itemsLista({ pantalla: { estado: 'ok', nota: '' } }), [{ clave: 'pantalla', estado: 'ok', nota: '' }])
assert.deepEqual(itemsLista({ carga: {} }), [{ clave: 'carga', estado: '', nota: '' }])
