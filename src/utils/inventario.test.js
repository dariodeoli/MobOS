import test from 'node:test'
import assert from 'node:assert/strict'
import { estadoInventario, nombreProducto, sigueEnInventario, sinCostoUnitario, costoEnGs } from './inventario.js'

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

test('costo diferido: una unidad sin costo queda marcada como pendiente', () => {
  assert.equal(sinCostoUnitario({ costPyg: null, originalCost: null }), true)
  assert.equal(sinCostoUnitario({}), true)
  assert.equal(sinCostoUnitario({ costPyg: 0, originalCost: 0 }), false, 'un costo 0 cargado no es pendiente')
  assert.equal(sinCostoUnitario({ costPyg: 120000 }), false)
  assert.equal(sinCostoUnitario({ originalCost: 350.5, costCurrency: 'USD' }), false)
})

test('el costo en Gs sale del guardado o del monto con su cotización', () => {
  assert.equal(costoEnGs({ costPyg: 1500000 }), 1500000)
  assert.equal(costoEnGs({ originalCost: 350.5, costCurrency: 'USD', exchangeRatePyg: 7500 }), 2628750)
  assert.equal(costoEnGs({ originalCost: 800000, costCurrency: 'PYG' }), 800000)
  assert.equal(costoEnGs({ originalCost: 350.5, costCurrency: 'USD' }), null, 'sin cotización no hay total')
  assert.equal(costoEnGs({ costPyg: null, originalCost: null }), null)
})
