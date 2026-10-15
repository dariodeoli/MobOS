import test from 'node:test'
import assert from 'node:assert/strict'
import { iconoProveedor, proveedorParaFicha } from './proveedorIdentidad.js'

const unidad = { supplierName: 'Importadora Tecnológica S.A.', supplier: { id: 'p1', code: 'IMPTEC', name: 'Importadora Tecnológica S.A.', displayMode: 'COMPLETO' } }

test('el vendedor recibe solo la sigla del proveedor, nunca el nombre real (#400)', () => {
  const vista = proveedorParaFicha(unidad, false)
  assert.equal(vista.sigla, 'IMPTEC')
  assert.equal(vista.nombre, '')
  assert.equal(vista.completo, false)
  assert.ok(!JSON.stringify(vista).includes('Importadora'))
})

test('sin sigla el vendedor ve S/S y no el nombre aunque llegue en supplierName', () => {
  const vista = proveedorParaFicha({ supplierName: 'Proveedor Secreto', supplier: { id: 'p2' } }, false)
  assert.equal(vista.sigla, 'S/S')
  assert.ok(!JSON.stringify(vista).includes('Secreto'))
})

test('administración y gerencia ven sigla y nombre; «Completo» destaca el nombre', () => {
  const vista = proveedorParaFicha(unidad, true)
  assert.deepEqual(vista, { sigla: 'IMPTEC', nombre: 'Importadora Tecnológica S.A.', completo: true })
  assert.equal(proveedorParaFicha({ ...unidad, supplier: { ...unidad.supplier, displayMode: 'ABREVIADO' } }, true).completo, false)
})

test('unidad sin proveedor no inventa sigla', () => {
  assert.deepEqual(proveedorParaFicha({}, false), { sigla: '', nombre: '', completo: false })
})

test('el ícono guardado en mayúsculas se traduce al set de Icon', () => {
  assert.equal(iconoProveedor('STORE'), 'store')
  assert.equal(iconoProveedor('inexistente'), '')
})
