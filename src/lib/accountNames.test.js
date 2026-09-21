import assert from 'node:assert/strict'
import test from 'node:test'
import { nombreCompleto, nombreOrdenable, opcionesDePartes, textoBuscable } from './accountNames.js'

const ana = { id: 'h1', firstName: 'Ana', middleName: 'María', lastName: 'Pérez', secondLastName: 'Gómez', document: '1234567-8', isActive: true }
const juan = { id: 'h2', firstName: 'Juan', otherName: 'Carlos', lastName: 'Ramírez', isActive: false }

test('el nombre del titular se compone en el orden pedido', () => {
  assert.equal(nombreCompleto(ana), 'Ana María Pérez Gómez')
  assert.equal(nombreCompleto({ firstName: 'Ana', otherName: 'Lucía', lastName: 'Pérez' }), 'Ana Lucía Pérez')
  assert.equal(nombreCompleto({ firstName: 'Ana', lastName: 'Pérez', middleName: '  ', secondLastName: null }), 'Ana Pérez')
  assert.equal(nombreCompleto(null), '')
})

test('el orden para listados pone los apellidos primero', () => {
  assert.equal(nombreOrdenable(ana), 'Pérez Gómez Ana María')
})

test('el texto buscable cubre nombre, documento, RUC y razón social', () => {
  assert.ok(textoBuscable(ana).includes('Ana María Pérez Gómez'))
  assert.ok(textoBuscable(ana).includes('1234567-8'))
  assert.ok(textoBuscable(ana).includes('Pérez'))
  assert.ok(textoBuscable({ legalName: 'Comercial XYZ S.A.', ruc: '80069563-1' }).includes('80069563-1'))
  assert.equal(textoBuscable(null), '')
})

test('las opciones del buscador de titulares separan titulares de empresas y saltan inactivos', () => {
  const opciones = opcionesDePartes([ana, juan], [{ id: 'c1', legalName: 'Comercial XYZ S.A.', ruc: '80069563-1', isActive: true }])
  assert.deepEqual(opciones.map((o) => o.value), ['holder:h1', 'company:c1'])
  assert.equal(opciones[0].label, 'Ana María Pérez Gómez')
  assert.equal(opciones[0].badge, 'Titular')
  assert.equal(opciones[0].detail, '1234567-8')
  assert.equal(opciones[1].badge, 'Empresa')
  assert.equal(opciones[1].detail, '80069563-1')
})
