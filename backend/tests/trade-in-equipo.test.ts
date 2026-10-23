import test from 'node:test'
import assert from 'node:assert/strict'
import { InputError, datosEquipoRecibido } from '../lib/payment-input'

// Equipo aceptado como parte de pago: color (del modelo), capacidad, % de batería, fallas y accesorios.
test('datos del equipo recibido: normaliza lo cargado y descarta lo vacío', () => {
  assert.deepEqual(datosEquipoRecibido({}, 'iPhone 15 Pro Max'), {})
  const datos = datosEquipoRecibido({ color: 'Titanio azul', storage: '256 gb', batteryPct: '87', faults: ['Cámaras con fallas', 'Cámaras con fallas'], faultsNote: ' rayón en el marco ', accessories: ['Caja', 'Cargador'] }, 'iPhone 15 Pro Max')
  assert.equal(datos.color, 'Titanio azul')
  assert.equal(datos.storage, '256GB')
  assert.equal(datos.batteryPct, 87)
  assert.deepEqual([...(datos.faults ?? [])], ['Cámaras con fallas'])
  assert.equal(datos.faultsNote, 'rayón en el marco')
  assert.deepEqual([...(datos.accessories ?? [])], ['Caja', 'Cargador'])
})

test('el color y la capacidad tienen que ser del modelo del catálogo; un modelo libre no se valida', () => {
  assert.throws(() => datosEquipoRecibido({ color: 'Rojo' }, 'iPhone 15 Pro Max'), (cause: unknown) => cause instanceof InputError && /no viene en color Rojo/.test(cause.message))
  assert.throws(() => datosEquipoRecibido({ storage: '128GB' }, 'iPhone 15 Pro Max'), (cause: unknown) => cause instanceof InputError && /no viene en 128GB/.test(cause.message))
  assert.equal(datosEquipoRecibido({ color: 'Cualquiera', storage: '99GB' }, 'Samsung Galaxy S23').color, 'Cualquiera')
})

test('la batería es un entero de 0 a 100 y las listas tienen tope', () => {
  for (const batteryPct of [-1, 101, 50.5, 'abc']) assert.throws(() => datosEquipoRecibido({ batteryPct }, 'iPhone 13'), InputError)
  assert.equal(datosEquipoRecibido({ batteryPct: 0 }, 'iPhone 13').batteryPct, 0)
  assert.throws(() => datosEquipoRecibido({ faults: Array.from({ length: 21 }, (_, indice) => `Falla ${indice}`) }, 'iPhone 13'), InputError)
  assert.throws(() => datosEquipoRecibido({ accessories: 'Caja' }, 'iPhone 13'), InputError)
})
