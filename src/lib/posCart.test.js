import test from 'node:test'
import assert from 'node:assert/strict'
import {
  borrarCarrito,
  claveCarrito,
  guardarCarrito,
  leerCarrito,
  lineasParaResumen,
  totalResumen,
} from './posCart.js'

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

test('el resumen del carrito suma cantidades sin duplicar el total', () => {
  const lineas = lineasParaResumen([
    { key: 'a', nombre: 'Cable', precio: 45000, quantity: 2 },
    { key: 'b', nombre: 'Funda', precio: 20000, quantity: 1 },
  ])
  assert.equal(lineas[0].nombre, 'Cable ×2')
  assert.equal(lineas[0].subtotal, 90000)
  assert.equal(lineas[1].nombre, 'Funda')
  assert.equal(lineas[1].subtotal, 20000)
  // El total sale de los subtotales: 90.000 + 20.000, no 4 × 45.000 + 20.000.
  assert.equal(totalResumen(lineas), 110000)
})

test('el resumen tolera carrito vacío, nulo y cantidades inválidas', () => {
  assert.deepEqual(lineasParaResumen([]), [])
  assert.deepEqual(lineasParaResumen(null), [])
  assert.equal(totalResumen(null), 0)
  const lineas = lineasParaResumen([{ key: 'a', nombre: 'Cable', precio: 1000, quantity: 0 }])
  assert.equal(lineas[0].quantity, 1)
  assert.equal(lineas[0].subtotal, 1000)
  assert.equal(totalResumen(lineas), 1000)
})
