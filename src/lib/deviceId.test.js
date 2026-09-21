import assert from 'node:assert/strict'
import test from 'node:test'
import { deviceId } from './deviceId.js'

function entornoFalso({ falla = false } = {}) {
  const guardado = new Map()
  return {
    guardado,
    entorno: {
      localStorage: {
        getItem: (clave) => guardado.get(clave) ?? null,
        setItem: (clave, valor) => {
          if (falla) throw new Error('sin almacenamiento')
          guardado.set(clave, valor)
        },
      },
      crypto: { randomUUID: () => 'uuid-de-prueba' },
    },
  }
}

test('genera el id una sola vez y lo reutiliza', () => {
  const { entorno, guardado } = entornoFalso()
  const primero = deviceId(entorno)
  assert.equal(primero, 'uuid-de-prueba')
  assert.equal(deviceId(entorno), primero)
  assert.equal(guardado.get('mobos:device-id'), primero)
})

test('si no puede persistir devuelve un id efímero y no lanza', () => {
  const { entorno } = entornoFalso({ falla: true })
  const id = deviceId(entorno)
  assert.ok(id)
  assert.equal(typeof id, 'string')
})

test('sin localStorage también devuelve un id', () => {
  assert.ok(deviceId({}))
})
