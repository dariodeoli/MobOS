// #209 en la demo (#204): el «último usado» vive en memoria de la pestaña y
// nunca toca `localStorage`, igual que el resto de los datos ficticios. Este
// archivo importa el helper con el runtime demo activo (ventana en /demo).
import test from 'node:test'
import assert from 'node:assert/strict'

const escrituras = []
globalThis.localStorage = {
  getItem: clave => { escrituras.push(`get:${clave}`); return null },
  setItem: clave => { escrituras.push(`set:${clave}`) },
  removeItem: clave => { escrituras.push(`del:${clave}`) },
}
globalThis.window = {
  location: { pathname: '/demo' },
  dispatchEvent: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
}
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

const { leerUltimo, recordarUltimo } = await import('./ultimoUsado.js')

test('en demo el último usado vive en memoria y no escribe localStorage', () => {
  recordarUltimo('fin:gastos-tipo', 'CHEQUE')
  assert.equal(leerUltimo('fin:gastos-tipo'), 'CHEQUE', 'lo recordado se lee dentro de la pestaña')
  recordarUltimo('fin:gastos-tipo', '')
  assert.equal(leerUltimo('fin:gastos-tipo', 'EXPENSE'), 'EXPENSE', 'vaciar vuelve al default')
  assert.deepEqual(escrituras, [], `la demo no debe tocar localStorage: ${escrituras.join(', ')}`)
})
