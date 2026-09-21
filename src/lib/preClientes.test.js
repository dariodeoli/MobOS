import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buscarPreClientes,
  descartarPreCliente,
  diasDeBorrador,
  guardarPreCliente,
  listarPreClientes,
} from './preClientes.js'

function mockStorage() {
  const datos = new Map()
  return {
    datos,
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => datos.set(k, String(v)),
    removeItem: (k) => datos.delete(k),
  }
}

const conReloj = (inicio) => {
  let t = inicio
  return () => (t += 1000)
}

test('guarda el borrador del RUC consultado y lo lista por empresa', () => {
  globalThis.localStorage = mockStorage()
  const guardado = guardarPreCliente('emp-a', { document: '80012345-6', name: 'PEREZ GOMEZ, JUAN CARLOS', phone: '0981 123 456' })
  assert.equal(guardado.name, 'Juan Carlos Perez Gomez')
  assert.equal(guardado.document, '80012345-6')
  assert.equal(listarPreClientes('emp-a').length, 1)
  assert.equal(listarPreClientes('emp-b').length, 0, 'no se mezcla entre empresas')
  assert.equal(guardarPreCliente('emp-a', { document: '', name: 'Sin doc' }), null)
})

test('reaparece al buscar por nombre (sin acentos) o por documento', () => {
  globalThis.localStorage = mockStorage()
  guardarPreCliente('emp-a', { document: '80012345-6', name: 'MARIA JOSE PEREZ' })
  guardarPreCliente('emp-a', { document: '1234567', name: 'Dario Oliveira' })
  assert.equal(buscarPreClientes('emp-a', 'maria jose').length, 1)
  assert.equal(buscarPreClientes('emp-a', 'MARÍA').length, 1)
  assert.equal(buscarPreClientes('emp-a', '800123').length, 1)
  assert.equal(buscarPreClientes('emp-a', 'oliveira').length, 1)
  assert.equal(buscarPreClientes('emp-a', 'no-existe').length, 0)
  assert.equal(buscarPreClientes('emp-a', '').length, 0)
})

test('el borrador vence y no se ofrece más', () => {
  globalThis.localStorage = mockStorage()
  const ahora = conReloj(0)
  guardarPreCliente('emp-a', { document: '80012345-6', name: 'Juan Perez' }, { dias: 7, ahora })
  assert.equal(listarPreClientes('emp-a', { ahora: () => 6 * 86400000 }).length, 1)
  assert.equal(listarPreClientes('emp-a', { ahora: () => 8 * 86400000 }).length, 0, 'vence a los 7 días')
})

test('el plazo es configurable por empresa (settings.preClienteDias)', () => {
  assert.equal(diasDeBorrador({ settings: { preClienteDias: 30 } }), 30)
  assert.equal(diasDeBorrador({ settings: { preClienteDias: 0 } }), 7)
  assert.equal(diasDeBorrador({}), 7)
  assert.equal(diasDeBorrador(null), 7)
})

test('se puede descartar el borrador (al crear la ficha)', () => {
  globalThis.localStorage = mockStorage()
  guardarPreCliente('emp-a', { document: '80012345-6', name: 'Juan Perez' })
  guardarPreCliente('emp-a', { document: '1234567', name: 'Dario Oliveira' })
  descartarPreCliente('emp-a', '80012345-6')
  const quedan = listarPreClientes('emp-a')
  assert.equal(quedan.length, 1)
  assert.equal(quedan[0].name, 'Dario Oliveira')
})
