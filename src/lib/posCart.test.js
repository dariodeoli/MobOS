import test from 'node:test'
import assert from 'node:assert/strict'
import { borrarCarrito, claveCarrito, guardarCarrito, leerCarrito, resolverCarritoSuspendido } from './posCart.js'

function mockStorage() {
  const datos = new Map()
  return {
    datos,
    getItem: k => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => datos.set(k, String(v)),
    removeItem: k => datos.delete(k),
  }
}

test('claveCarrito separa empresa y sucursal y exige empresa', () => {
  assert.equal(claveCarrito('emp-a', 'suc-1'), 'mobos:pos-cart:v1:emp-a:suc-1')
  assert.equal(claveCarrito('emp-a', null), 'mobos:pos-cart:v1:emp-a')
  assert.equal(claveCarrito(null, 'suc-1'), null)
})

test('guardar y leer redondea el carrito completo', () => {
  const mock = mockStorage()
  globalThis.localStorage = mock
  const carrito = {
    items: [{ key: 'k1', productoId: 'p1', quantity: 2 }],
    cliente: 'Ana',
    descuento: '5000',
  }
  assert.equal(guardarCarrito('emp-a', 'suc-1', carrito), true)
  assert.deepEqual(leerCarrito('emp-a', 'suc-1'), carrito)
})

test('leer devuelve null sin carrito guardado', () => {
  globalThis.localStorage = mockStorage()
  assert.equal(leerCarrito('emp-a', 'suc-1'), null)
})

test('leer tolera JSON corrupto y valores que no son objeto', () => {
  const mock = mockStorage()
  mock.datos.set('mobos:pos-cart:v1:emp-a', '{no es json')
  globalThis.localStorage = mock
  assert.equal(leerCarrito('emp-a'), null)
  mock.datos.set('mobos:pos-cart:v1:emp-a', '[1,2,3]')
  assert.equal(leerCarrito('emp-a'), null)
})

test('borrar elimina solo la clave propia', () => {
  const mock = mockStorage()
  globalThis.localStorage = mock
  guardarCarrito('emp-a', 'suc-1', { items: [] })
  guardarCarrito('emp-a', 'suc-2', { items: [{ key: 'x' }] })
  borrarCarrito('emp-a', 'suc-1')
  assert.equal(leerCarrito('emp-a', 'suc-1'), null)
  assert.ok(leerCarrito('emp-a', 'suc-2'))
})

test('sin empresa no se escribe ni se lee', () => {
  globalThis.localStorage = mockStorage()
  assert.equal(guardarCarrito(null, 'suc-1', { items: [] }), false)
  assert.equal(leerCarrito(null, 'suc-1'), null)
})

test('al retomar, el carrito se re-resuelve con la lista vigente y avisa el cambio', () => {
  const items = [
    { key: 'k1', productoId: 'p1', nombre: 'Auricular', precio: 250000, quantity: 1 },
    { key: 'k2', productoId: 'p2', nombre: 'Funda', precio: 80000, quantity: 2 },
  ]
  const precios = {
    k1: { unitPricePyg: 275000, origin: 'LIST', priceList: { name: 'Lista julio' } },
    k2: { unitPricePyg: 80000, origin: 'RETAIL' },
  }
  const { items: resueltas, cambios } = resolverCarritoSuspendido(items, precios)
  assert.equal(resueltas[0].precio, 275000)
  assert.equal(resueltas[0].precioLista, 'Lista julio')
  assert.equal(resueltas[0].precioOrigen, 'LIST')
  // El precio que no cambió no se reporta ni se toca.
  assert.equal(resueltas[1], items[1])
  assert.deepEqual(cambios, [
    { key: 'k1', nombre: 'Auricular', antes: 250000, despues: 275000, origen: 'LIST' },
  ])
})

test('el escalón por cantidad usa el precio resuelto para esa cantidad', () => {
  const items = [{ key: 'k1', productoId: 'p1', nombre: 'Cable', precio: 45000, quantity: 10 }]
  const { items: resueltas, cambios } = resolverCarritoSuspendido(items, {
    k1: { unitPricePyg: 40000, origin: 'TIER', minQty: 10 },
  })
  assert.equal(resueltas[0].precio, 40000)
  assert.equal(resueltas[0].precioMinQty, 10)
  assert.equal(cambios[0].despues, 40000)
})

test('precio manual, cupón y combo conservan su precio guardado', () => {
  const items = [
    { key: 'k1', productoId: 'p1', nombre: 'Manual', precio: 100000, quantity: 1, precioManual: true },
    { key: 'k2', productoId: 'p2', nombre: 'Cupón', precio: 90000, quantity: 1, couponCode: 'CUPON10' },
    { key: 'k3', productoId: 'p3', nombre: 'Combo', precio: 150000, quantity: 1, combo: 'Kit' },
  ]
  const precios = {
    k1: { unitPricePyg: 130000 },
    k2: { unitPricePyg: 130000 },
    k3: { unitPricePyg: 130000 },
  }
  const { items: resueltas, cambios } = resolverCarritoSuspendido(items, precios)
  assert.deepEqual(resueltas, items)
  assert.deepEqual(cambios, [])
})

test('sin resolución del servidor o con precio inválido se conserva lo guardado', () => {
  const items = [
    { key: 'k1', productoId: 'p1', nombre: 'Sin resolver', precio: 100000, quantity: 1 },
    { key: 'k2', productoId: 'p2', nombre: 'Cero', precio: 100000, quantity: 1 },
    { key: 'k3', productoId: 'p3', nombre: 'Negativo', precio: 100000, quantity: 1 },
  ]
  const { items: resueltas, cambios } = resolverCarritoSuspendido(items, {
    k2: { unitPricePyg: 0 },
    k3: { unitPricePyg: -5000 },
  })
  assert.deepEqual(resueltas, items)
  assert.deepEqual(cambios, [])
})

test('el fallback USD del servidor manda sobre el precio en dólares crudo', () => {
  const items = [{ key: 'k1', productoId: 'p1', nombre: 'Importado', precio: 700000, quantity: 1 }]
  const { items: resueltas } = resolverCarritoSuspendido(items, {
    k1: { unitPricePyg: 25, unitPriceUsd: 25, unitPricePygFallback: 750000, currency: 'USD', origin: 'USD' },
  })
  assert.equal(resueltas[0].precio, 750000)
  assert.equal(resueltas[0].precioUsd, 25)
  assert.equal(resueltas[0].precioListaValor, null)
})

test('un carrito vacío o sin items no rompe', () => {
  assert.deepEqual(resolverCarritoSuspendido(null), { items: [], cambios: [] })
  assert.deepEqual(resolverCarritoSuspendido([null, 'x'], {}).items, [null, 'x'])
})

test('cuota llena o almacenamiento roto no revienta', () => {
  globalThis.localStorage = {
    getItem: () => {
      throw new Error('SecurityError')
    },
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
    removeItem: () => {
      throw new Error('SecurityError')
    },
  }
  assert.equal(leerCarrito('emp-a'), null)
  assert.equal(guardarCarrito('emp-a', null, { items: [] }), false)
  borrarCarrito('emp-a')
})
