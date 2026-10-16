import test from 'node:test'
import { setImmediate } from 'node:timers'
import assert from 'node:assert/strict'
import { geometriaDialogoTeclado, ajustarDialogoAlTeclado } from './teclado.js'

test('viewport de teclado usa menor altura visual/nativa, incluye pan y recupera al ocultar', () => {
  assert.deepEqual(geometriaDialogoTeclado({ layoutHeight: 844, visualHeight: 844, keyboardHeight: 444 }), { height: 400, top: 0, visible: true })
  assert.deepEqual(geometriaDialogoTeclado({ layoutHeight: 844, visualHeight: 380, offsetTop: 50, keyboardHeight: 400 }), { height: 380, top: 50, visible: true })
  assert.deepEqual(geometriaDialogoTeclado({ layoutHeight: 844, visualHeight: 400, offsetTop: 100, keyboardHeight: 400 }), { height: 344, top: 100, visible: true })
  assert.deepEqual(geometriaDialogoTeclado({ layoutHeight: 844 }), { height: 844, top: 0, visible: false })
})
test('eventos nativos y visualViewport se limpian, incluso registro que resuelve tras desmontar', async () => {
  const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0 })
  const win = Object.assign(new EventTarget(), { innerHeight: 844, visualViewport: viewport, requestAnimationFrame: callback => { callback(); return 1 }, cancelAnimationFrame() {} })
  const values = new Map()
  const dialog = { dataset: {}, style: { setProperty: (key, value) => values.set(key, value), removeProperty: key => values.delete(key) } }
  const form = Object.assign(new EventTarget(), { closest: () => dialog, ownerDocument: { activeElement: null }, contains: () => false })
  const callbacks = new Map()
  let removed = 0
  let complete
  const cleanup = ajustarDialogoAlTeclado(form, { win, native: true, loadKeyboard: async () => ({ addListener: (event, callback) => { callbacks.set(event, callback); return new Promise(resolve => { complete = () => resolve({ remove: async () => { removed++ } }) }) } }) })
  await Promise.resolve()
  callbacks.get('keyboardWillShow')({ keyboardHeight: 444 })
  assert.equal(values.get('--identidad-viewport-height'), '400px')
  cleanup()
  complete()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(removed, 1)
  assert.equal(values.size, 0)
  viewport.height = 300
  viewport.dispatchEvent(new Event('resize'))
  assert.equal(values.size, 0)
  assert.equal(dialog.dataset.tecladoVisible, undefined)
})

test('resize body usa evento nativo aunque visualViewport no cambie y recupera al ocultar', async () => {
  const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0 })
  const win = Object.assign(new EventTarget(), { innerHeight: 844, visualViewport: viewport, requestAnimationFrame: callback => { queueMicrotask(callback); return 1 }, cancelAnimationFrame() {} })
  const values = new Map()
  const dialog = { dataset: {}, style: { setProperty: (key, value) => values.set(key, value), removeProperty: key => values.delete(key) } }
  const form = Object.assign(new EventTarget(), { closest: () => dialog, ownerDocument: { activeElement: null }, contains: () => false })
  const callbacks = new Map()
  let removed = 0
  const cleanup = ajustarDialogoAlTeclado(form, { win, native: true, loadKeyboard: async () => ({ addListener: async (event, callback) => { callbacks.set(event, callback); return { remove: async () => { removed++ } } } }) })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(callbacks.size, 4)
  callbacks.get('keyboardDidShow')({ keyboardHeight: 400 })
  await Promise.resolve()
  assert.equal(values.get('--identidad-viewport-height'), '444px')
  assert.equal(dialog.dataset.tecladoVisible, 'true')
  viewport.height = 400
  viewport.offsetTop = 100
  viewport.dispatchEvent(new Event('scroll'))
  await Promise.resolve()
  assert.equal(values.get('--identidad-viewport-top'), '100px')
  assert.equal(values.get('--identidad-viewport-height'), '344px')
  viewport.height = 844
  viewport.offsetTop = 0
  callbacks.get('keyboardDidHide')()
  await Promise.resolve()
  assert.equal(dialog.dataset.tecladoVisible, 'false')
  cleanup()
  await Promise.resolve()
  assert.equal(removed, 4)
  assert.equal(values.size, 0)
})
