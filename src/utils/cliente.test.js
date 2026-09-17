import test from 'node:test'
import assert from 'node:assert/strict'
import { coincideCliente, datosFacturacionCliente, textoBusquedaCliente } from './cliente.js'

const cliente = {
  name: 'Juan Pérez',
  phone: '981123456',
  phones: ['981123456', '971000111'],
  document: '80012345-6',
  email: 'juan@empresa.com',
  billingName: 'Empresa XYZ S.A.',
  billingDocument: '80099999-1',
}

test('encuentra por nombre, apellido y nombre completo', () => {
  assert.equal(coincideCliente(cliente, 'Juan'), true)
  assert.equal(coincideCliente(cliente, 'perez'), true)
  assert.equal(coincideCliente(cliente, 'juan perez'), true)
})

test('encuentra por teléfono, CI/RUC y correo', () => {
  assert.equal(coincideCliente(cliente, '971000111'), true)
  assert.equal(coincideCliente(cliente, '80012345'), true)
  assert.equal(coincideCliente(cliente, 'juan@empresa'), true)
})

test('encuentra por los datos de facturación del cliente', () => {
  assert.equal(coincideCliente(cliente, 'Empresa XYZ'), true)
  assert.equal(coincideCliente(cliente, '80099999'), true)
  assert.equal(coincideCliente(cliente, 'empresa xyz s.a.'), true)
})

test('no coincide cuando el dato no existe y la consulta vacía acepta todo', () => {
  assert.equal(coincideCliente(cliente, 'Gómez'), false)
  assert.equal(coincideCliente(cliente, ''), true)
})

test('expone el texto buscable y los datos de facturación', () => {
  assert.match(textoBusquedaCliente(cliente), /empresa xyz s\.a\./)
  assert.deepEqual(datosFacturacionCliente(cliente), { name: 'Empresa XYZ S.A.', document: '80099999-1' })
  assert.equal(datosFacturacionCliente({ name: 'Sin factura' }), null)
})
