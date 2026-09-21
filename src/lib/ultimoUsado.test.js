// Patrón #209: pruebas del helper de "último usado". Se corre con los tests
// puros de frontend (`npm test`): no necesita navegador, solo un storage falso.
import test from 'node:test'
import assert from 'node:assert/strict'

const store = new Map()
globalThis.localStorage = {
  getItem: clave => (store.has(clave) ? store.get(clave) : null),
  setItem: (clave, valor) => store.set(clave, String(valor)),
  removeItem: clave => store.delete(clave),
}
globalThis.window = { location: { pathname: '/' }, dispatchEvent: () => {}, addEventListener: () => {}, removeEventListener: () => {} }

const { EVENTO_ULTIMO_USADO, leerUltimo, recordarUltimo } = await import('./ultimoUsado.js')

test('sin valor guardado devuelve el inicial', () => {
  assert.equal(leerUltimo('inventario:motivo-baja', 'Daño'), 'Daño')
  assert.equal(leerUltimo('inventario:motivo-baja'), '')
})

test('recordarUltimo guarda con prefijo y leerUltimo lo devuelve', () => {
  recordarUltimo('inventario:motivo-baja', 'Daño')
  assert.equal(leerUltimo('inventario:motivo-baja'), 'Daño')
  assert.equal(store.has('inventario:motivo-baja'), false, 'la clave cruda no se escribe')
  assert.equal(store.get('mobos:ultimo:inventario:motivo-baja'), 'Daño')
  assert.ok(EVENTO_ULTIMO_USADO)
})

test('vaciar el valor olvida la clave', () => {
  recordarUltimo('inventario:motivo-baja', '')
  assert.equal(leerUltimo('inventario:motivo-baja', 'Otro'), 'Otro')
  assert.equal(store.has('mobos:ultimo:inventario:motivo-baja'), false)
})

test('sin localStorage no rompe y devuelve el inicial', () => {
  const original = globalThis.localStorage
  delete globalThis.localStorage
  assert.equal(leerUltimo('cualquiera', 'inicial'), 'inicial')
  recordarUltimo('cualquiera', 'valor')
  globalThis.localStorage = original
})
