import assert from 'node:assert/strict'
import test from 'node:test'
import { copiarAlPortapapeles } from './portapapeles.js'

function campoFalso(ok) {
  const campo = { value: '', style: {}, setAttribute: () => {}, select: () => {}, remove: () => {} }
  const doc = {
    createElement: () => campo,
    body: { appendChild: () => {}, removeChild: () => {} },
    execCommand: () => ok,
  }
  return { doc, campo }
}

test('usa la Clipboard API cuando está disponible', async () => {
  const escritos = []
  const entorno = { navigator: { clipboard: { writeText: async (valor) => { escritos.push(valor) } } } }
  assert.equal(await copiarAlPortapapeles('hola', entorno), true)
  assert.deepEqual(escritos, ['hola'])
})

test('cae al campo temporal si la Clipboard API falla', async () => {
  const { doc, campo } = campoFalso(true)
  const entorno = { navigator: { clipboard: { writeText: async () => { throw new Error('permiso') } } }, document: doc }
  assert.equal(await copiarAlPortapapeles('respaldo', entorno), true)
  assert.equal(campo.value, 'respaldo')
})

test('sin Clipboard API usa el respaldo y reporta el resultado', async () => {
  assert.equal(await copiarAlPortapapeles('x', { document: campoFalso(true).doc }), true)
  assert.equal(await copiarAlPortapapeles('x', { document: campoFalso(false).doc }), false)
})

test('sin portapapeles ni documento devuelve false y no lanza', async () => {
  assert.equal(await copiarAlPortapapeles('x', {}), false)
  assert.equal(await copiarAlPortapapeles('', {}), false)
  assert.equal(await copiarAlPortapapeles(null, {}), false)
})
