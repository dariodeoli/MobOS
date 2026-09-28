import test from 'node:test'
import assert from 'node:assert/strict'
import { CONDICION_UNIDAD, colorCondicionUnidad, colorInventario, estadoInventario, etiquetaCondicionUnidad, nombreProducto, puntoCondicionUnidad, sigueEnInventario, sinCostoUnitario, costoEnGs, tonoInventario, serialNormalizado, unidadesElegibles } from './inventario.js'

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

// Lote 13: el tono de la unidad es uno solo para la lista, la tarjeta y la
// ficha (antes "disponible seminuevo" era verde en la ficha y naranja acá).
test('el tono de la unidad sale de una sola regla', () => {
  assert.equal(tonoInventario({ status: 'AVAILABLE', condition: 'NEW' }), 'ok')
  assert.equal(tonoInventario({ status: 'AVAILABLE', condition: 'USED' }), 'warn')
  assert.equal(tonoInventario({ status: 'AVAILABLE', condition: 'REFURBISHED' }), 'warn')
  assert.equal(tonoInventario({ status: 'RESERVED' }), 'warn')
  assert.equal(tonoInventario({ status: 'IN_TRANSIT' }), 'info')
  assert.equal(tonoInventario({ status: 'DEFECTIVE' }), 'mute')
  assert.equal(tonoInventario({ status: 'SOLD' }), 'bad')
  assert.equal(tonoInventario({ status: 'SOLD', sale: { fulfillmentStatus: 'READY_FOR_PICKUP' } }), 'warn')
  assert.equal(tonoInventario({ status: 'SOLD', sale: { fulfillmentStatus: 'DELIVERED' } }), 'mute')

  // La etiqueta y el color acompañan al tono en todas las pantallas.
  assert.equal(colorInventario({ status: 'AVAILABLE', condition: 'USED' }), 'orange')
  assert.equal(estadoInventario({ status: 'AVAILABLE', condition: 'USED' }).tone, 'orange')
  assert.equal(colorInventario({ status: 'AVAILABLE', condition: 'NEW' }), 'green')
  assert.equal(colorInventario({ status: 'SOLD' }), 'red')
})

test('la condición física tiene etiqueta, color y punto compartidos', () => {
  assert.deepEqual(Object.keys(CONDICION_UNIDAD), ['NEW', 'USED', 'REFURBISHED'])
  assert.equal(etiquetaCondicionUnidad({ condition: 'REFURBISHED' }), 'Reacondicionado')
  assert.equal(etiquetaCondicionUnidad({}), '—')
  assert.equal(colorCondicionUnidad({ condition: 'NEW' }), 'green')
  assert.equal(colorCondicionUnidad({ condition: 'USED' }), 'orange')
  assert.equal(puntoCondicionUnidad({ condition: 'NEW' }), 'bg-ok')
  assert.equal(puntoCondicionUnidad({ condition: 'USED' }), 'bg-warn')
  assert.equal(puntoCondicionUnidad({}), 'bg-mute')
})

// #286: el selector del POS no puede descartar unidades por sucursal — cuando
// la venta no manda sucursal, el servidor ya acota por la sesión.
test('unidadesElegibles deja las vendibles del producto y la ya elegida', () => {
  const unidades = [
    { id: 'u1', productId: 'p1', status: 'AVAILABLE', serial: 'ABC-123' },
    { id: 'u2', productId: 'p1', status: 'RESERVED', serial: 'DEF456' },
    { id: 'u3', productId: 'p2', status: 'AVAILABLE', serial: 'OTRO' },
    { id: 'u4', productId: 'p1', status: 'SOLD', serial: 'GHI789' },
    { id: 'u5', productId: 'p1', status: 'RESERVED', serial: 'MOBOS: JKL 000' },
  ]
  const elegibles = unidadesElegibles(unidades, { productId: 'p1', seleccionados: ['jkl000'] })
  assert.deepEqual(elegibles.map((unit) => unit.id), ['u1', 'u5'])
})

test('unidadesElegibles ignora unidades sin sucursal y sin producto', () => {
  const conSucursal = [{ id: 'u1', productId: 'p1', status: 'AVAILABLE', serial: 'A1', branchId: 'branch-1' }]
  assert.deepEqual(unidadesElegibles(conSucursal, { productId: 'p1' }).map((unit) => unit.id), ['u1'], 'la sucursal la decide la API, no el cliente')
  assert.deepEqual(unidadesElegibles(conSucursal, { productId: '' }), [])
  assert.deepEqual(unidadesElegibles(null, { productId: 'p1' }), [])
})

test('serialNormalizado equipara lo que el vendedor eligió con lo que devuelve la API', () => {
  assert.equal(serialNormalizado(' MOBOS:abc-123 '), 'ABC123')
  assert.equal(serialNormalizado(undefined), '')
})
