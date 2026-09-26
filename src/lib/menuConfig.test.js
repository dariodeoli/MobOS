import assert from 'node:assert/strict'
import test from 'node:test'
import { ESTADOS_MENU_CONFIG, guardarMenuConfigColapsado, menuConfigColapsado } from './menuConfig.js'

// La preferencia del menú de Configuración vive por dispositivo (#267): estos
// tests cubren el guardado, el default y la tolerancia a un storage roto. El
// módulo usa `window` (como el resto de las preferencias de UI).
const almacen = new Map()
const memoria = {
  getItem: (clave) => (almacen.has(clave) ? almacen.get(clave) : null),
  setItem: (clave, valor) => { almacen.set(clave, String(valor)) },
  removeItem: (clave) => { almacen.delete(clave) },
}
const eventos = []

function instalarWindow(storage = memoria) {
  globalThis.window = {
    localStorage: storage,
    dispatchEvent: (evento) => eventos.push(evento.type),
    addEventListener: () => {},
    removeEventListener: () => {},
  }
}

instalarWindow()

test('el menú arranca expandido y recuerda el último uso', () => {
  assert.deepEqual(ESTADOS_MENU_CONFIG, ['expandido', 'colapsado'])
  assert.equal(menuConfigColapsado(), false, 'sin dato, expandido')
  assert.equal(guardarMenuConfigColapsado(true), true)
  assert.equal(almacen.get('mobos:config-menu'), 'colapsado')
  assert.equal(menuConfigColapsado(), true)
  assert.equal(guardarMenuConfigColapsado(false), false)
  assert.equal(almacen.get('mobos:config-menu'), 'expandido')
  assert.equal(menuConfigColapsado(), false, 'vuelve a expandido')
  assert.ok(eventos.includes('mobos:config-menu-cambio'), 'avisa a las otras instancias')
})

test('un valor raro o un storage roto no rompen la pantalla', () => {
  almacen.set('mobos:config-menu', 'cualquiera')
  assert.equal(menuConfigColapsado(), false, 'solo "colapsado" colapsa')
  instalarWindow({ getItem: () => { throw new Error('sin storage') }, setItem: () => { throw new Error('sin storage') } })
  assert.equal(menuConfigColapsado(), false)
  assert.equal(guardarMenuConfigColapsado(true), true, 'el guardado devuelve el valor aunque no persista')
})
