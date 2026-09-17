import test from 'node:test'
import assert from 'node:assert/strict'
import { estadoInventario, nombreProducto, sigueEnInventario } from './inventario.js'

test('el nombre comercial agrega la capacidad solo si falta', () => {
  assert.equal(nombreProducto({ name: 'iPhone 15 Pro Max', capacity: '256 GB' }), 'iPhone 15 Pro Max · 256 GB')
  assert.equal(nombreProducto({ name: 'iPhone 15 Pro 256GB Titanio', capacity: '256 GB' }), 'iPhone 15 Pro 256GB Titanio')
  assert.equal(nombreProducto({ name: 'Cable USB-C' }), 'Cable USB-C')
  assert.equal(nombreProducto({}, 'Funda E2E'), 'Funda E2E')
  assert.equal(nombreProducto({}), '')
})

test('el estado vendido hereda la entrega del pedido', () => {
  assert.deepEqual(estadoInventario({ status: 'AVAILABLE' }), { clave: 'AVAILABLE', label: 'Disponible', tone: 'green' })
  assert.equal(estadoInventario({ status: 'RESERVED' }).label, 'Reservado')
  assert.equal(estadoInventario({ status: 'DEFECTIVE' }).label, 'En revisión')
  assert.equal(estadoInventario({ status: 'SOLD', sale: { fulfillmentStatus: 'READY_FOR_PICKUP' } }).label, 'Listo p/ retirar')
  assert.equal(estadoInventario({ status: 'SOLD', sale: { fulfillmentStatus: 'PROCESSING' } }).label, 'Vendido')
  assert.equal(estadoInventario({ status: 'SOLD', sale: { fulfillmentStatus: 'DELIVERED' } }).label, 'Entregado')
})

test('solo la entrega confirmada saca la unidad del inventario', () => {
  assert.equal(sigueEnInventario({ status: 'AVAILABLE' }), true)
  assert.equal(sigueEnInventario({ status: 'RESERVED' }), true)
  assert.equal(sigueEnInventario({ status: 'DEFECTIVE' }), true)
  assert.equal(sigueEnInventario({ status: 'SOLD', sale: { fulfillmentStatus: 'PROCESSING' } }), true)
  assert.equal(sigueEnInventario({ status: 'SOLD', sale: { fulfillmentStatus: 'READY_FOR_PICKUP' } }), true)
  assert.equal(sigueEnInventario({ status: 'SOLD', sale: { fulfillmentStatus: 'DELIVERED' } }), false)
  assert.equal(sigueEnInventario({ status: 'SOLD' }), true)
})
