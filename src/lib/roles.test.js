import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CAPACIDADES,
  CAPACIDAD_DOMINIOS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLE_ORDER,
  capacidadesDe,
  capacidadesNegadas,
  capacidadesPorDominio,
} from './roles.js'

test('cada rol tiene etiqueta y descripción', () => {
  for (const rol of ROLE_ORDER) {
    assert.ok(ROLE_LABELS[rol], `falta etiqueta de ${rol}`)
    assert.ok(ROLE_DESCRIPTIONS[rol], `falta descripción de ${rol}`)
  }
  assert.equal(Object.keys(ROLE_LABELS).length, ROLE_ORDER.length)
  assert.equal(Object.keys(ROLE_DESCRIPTIONS).length, ROLE_ORDER.length)
})

test('cada capacidad declara dominio válido, textos y roles conocidos', () => {
  const ids = new Set()
  for (const capacidad of CAPACIDADES) {
    assert.ok(capacidad.id && !ids.has(capacidad.id), `id repetido o vacío: ${capacidad.id}`)
    ids.add(capacidad.id)
    assert.ok(CAPACIDAD_DOMINIOS.includes(capacidad.dominio), `dominio inválido: ${capacidad.dominio}`)
    assert.ok(capacidad.label?.trim(), `falta etiqueta en ${capacidad.id}`)
    assert.ok(capacidad.description?.trim(), `falta descripción en ${capacidad.id}`)
    assert.ok(capacidad.roles.length > 0, `${capacidad.id} no tiene roles`)
    for (const rol of capacidad.roles) {
      assert.ok(ROLE_ORDER.includes(rol), `rol desconocido en ${capacidad.id}: ${rol}`)
    }
    assert.equal(new Set(capacidad.roles).size, capacidad.roles.length, `roles repetidos en ${capacidad.id}`)
  }
})

test('el Dueño conserva todas las capacidades', () => {
  assert.equal(capacidadesDe('ADMIN').length, CAPACIDADES.length)
  assert.equal(capacidadesNegadas('ADMIN').length, 0)
})

test('las capacidades de cada rol suman el total', () => {
  for (const rol of ROLE_ORDER) {
    assert.equal(capacidadesDe(rol).length + capacidadesNegadas(rol).length, CAPACIDADES.length)
  }
})

test('los dominios agrupan todas las capacidades sin duplicarlas', () => {
  const grupos = capacidadesPorDominio()
  assert.deepEqual(
    grupos.map(grupo => grupo.dominio),
    CAPACIDAD_DOMINIOS.filter(dominio => CAPACIDADES.some(capacidad => capacidad.dominio === dominio)),
  )
  const agrupadas = grupos.flatMap(grupo => grupo.capacidades.map(capacidad => capacidad.id))
  assert.equal(agrupadas.length, CAPACIDADES.length)
  assert.equal(new Set(agrupadas).size, CAPACIDADES.length)
})
