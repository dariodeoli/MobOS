import test from 'node:test'
import assert from 'node:assert/strict'
import { geometriaDialogoTeclado, ajustarDialogoAlTeclado } from './teclado.js'

test('geometría limita altura visual/nativa/pan y body ya reducido sin doble resta', () => {
  assert.deepEqual(geometriaDialogoTeclado({ layoutHeight: 844, visualHeight: 844, keyboardHeight: 444 }), { height: 400, top: 0, visible: true })
  assert.deepEqual(geometriaDialogoTeclado({ layoutHeight: 844, visualHeight: 400, offsetTop: 100, keyboardHeight: 400 }), { height: 344, top: 100, visible: true })
  assert.deepEqual(geometriaDialogoTeclado({ layoutHeight: 844, visualHeight: 400, bodyHeight: 400, keyboardHeight: 444 }), { height: 400, top: 0, visible: true })
  assert.deepEqual(geometriaDialogoTeclado({ layoutHeight: 844, visualHeight: 844, bodyHeight: 400 }), { height: 400, top: 0, visible: true })
  assert.deepEqual(geometriaDialogoTeclado({ layoutHeight: 844 }), { height: 844, top: 0, visible: false })
})
function fixture() {
  let mutation
  let disconnected = false
  const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0 })
  const win = Object.assign(new EventTarget(), { innerHeight: 844, visualViewport: viewport, requestAnimationFrame: callback => { queueMicrotask(callback); return 1 }, cancelAnimationFrame() {}, MutationObserver: class { constructor(callback) { mutation = callback } observe() {} disconnect() { disconnected = true } } })
  const values = new Map()
  const dialog = { dataset: {}, style: { setProperty: (key, value) => values.set(key, value), removeProperty: key => values.delete(key) } }
  const form = Object.assign(new EventTarget(), { closest: () => dialog, ownerDocument: { activeElement: null, body: { style: {} } }, contains: () => false })
  return { win, viewport, values, dialog, form, mutate: () => mutation(), disconnected: () => disconnected }
}
test('eventos nativos window se admiten desde montaje y se liberan sin registro async', async () => {
  const { win, values, dialog, form, disconnected } = fixture()
  const cleanup = ajustarDialogoAlTeclado(form, { win })
  win.dispatchEvent(Object.assign(new Event('keyboardWillShow'), { keyboardHeight: 444 }))
  await Promise.resolve()
  assert.equal(values.get('--identidad-viewport-height'), '400px')
  win.dispatchEvent(new Event('keyboardDidHide'))
  await Promise.resolve()
  assert.equal(dialog.dataset.tecladoVisible, 'false')
  cleanup()
  assert.equal(disconnected(), true)
  win.dispatchEvent(Object.assign(new Event('keyboardDidShow'), { keyboardHeight: 444 }))
  await Promise.resolve()
  assert.equal(values.size, 0)
  assert.equal(dialog.dataset.tecladoVisible, undefined)
})
test('body-only y WebView con innerHeight ya reducido no dejan altura1 y restauran al ocultar', async () => {
  const { win, values, dialog, form, mutate } = fixture()
  const cleanup = ajustarDialogoAlTeclado(form, { win })
  form.ownerDocument.body.style.height = '400px'
  mutate()
  await Promise.resolve()
  assert.equal(values.get('--identidad-viewport-height'), '400px')
  win.innerHeight = 400
  win.visualViewport.height = 400
  win.dispatchEvent(Object.assign(new Event('keyboardDidShow'), { keyboardHeight: 444 }))
  await Promise.resolve()
  assert.equal(values.get('--identidad-viewport-height'), '400px')
  win.innerHeight = 844
  win.visualViewport.height = 844
  form.ownerDocument.body.style.height = ''
  win.dispatchEvent(new Event('keyboardDidHide'))
  await Promise.resolve()
  assert.equal(dialog.dataset.tecladoVisible, 'false')
  cleanup()
  mutate()
  await Promise.resolve()
  assert.equal(values.size, 0)
})
