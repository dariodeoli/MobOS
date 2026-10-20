import test from 'node:test'
import assert from 'node:assert/strict'
import { actualizarClienteDemo, guardarClienteDemo, listarClientesDemo, buscarClienteDemo, clienteDeTokenDemo, registrarPedidoDemoDeVenta, sincronizarPedidoDemoConVenta, registrarInteraccionDemo, registrarInformeDemo, registrarVistoInformeDemo, filaInformeDemo, demoCuentaPayload, SEED_DEMO_CLIENTES } from './demoClientes.js'
import { limpiarMemoriaDemo } from './demoStorage.js'

test('demo customer upsert replaces seed by id without duplicates or seed mutation; reset restores it', () => {
  limpiarMemoriaDemo()
  const seed = SEED_DEMO_CLIENTES[0]
  const before = JSON.stringify(seed)
  const count = listarClientesDemo().length
  const previousStorage = globalThis.localStorage
  let storageAccesses = 0
  globalThis.localStorage = { getItem() { storageAccesses++; throw Error('No real storage') }, setItem() { storageAccesses++; throw Error('No real storage') } }
  try {
    const edited = actualizarClienteDemo({ id: seed.id, name: 'Nombre editado demo', addresses: [{ label: 'Casa demo', address: 'Calle sintética 350' }] })
    assert.equal(listarClientesDemo().length, count)
    assert.equal(listarClientesDemo().filter(row => row.id === seed.id).length, 1)
    assert.equal(buscarClienteDemo(seed.id).name, edited.name)
    assert.deepEqual(clienteDeTokenDemo(`demo-${seed.id}-completo`).cliente.addresses, edited.addresses)
    assert.deepEqual(buscarClienteDemo(seed.id).demoProfile, seed.demoProfile, 'partial card edit preserves profile')
    assert.equal(JSON.stringify(seed), before, 'seed untouched')
    guardarClienteDemo({ id: 'demo-cliente-350', name: 'Nuevo demo' })
    guardarClienteDemo({ id: 'demo-cliente-350', name: 'Nuevo demo corregido' })
    assert.equal(listarClientesDemo().filter(row => row.id === 'demo-cliente-350').length, 1)
    assert.equal(buscarClienteDemo('demo-cliente-350').name, 'Nuevo demo corregido')
    assert.equal(storageAccesses, 0)
    limpiarMemoriaDemo()
    assert.equal(buscarClienteDemo('demo-cliente-350'), null)
    assert.equal(buscarClienteDemo(seed.id).name, seed.name)
    assert.equal(JSON.stringify(seed), before)
  } finally {
    limpiarMemoriaDemo()
    if (previousStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousStorage
  }
})


test('seed overrides keep later sales, interactions, report shares and seen state without mutating seeds', () => {
  limpiarMemoriaDemo()
  const seed = SEED_DEMO_CLIENTES[0]
  const before = JSON.stringify(seed)
  const previousStorage = globalThis.localStorage
  let storageAccesses = 0
  globalThis.localStorage = { getItem() { storageAccesses++; throw Error('No real storage') }, setItem() { storageAccesses++; throw Error('No real storage') } }
  try {
    actualizarClienteDemo({ id: seed.id, name: 'Nombre override', email: 'override@example.invalid' })
    const order = registrarPedidoDemoDeVenta(seed.id, { numero: 'DEMO350-ORDER', total: 10000, pagado: 2000, items: [{ description: 'Funda sintética', quantity: 1 }] })
    const interaction = registrarInteraccionDemo(seed.id, { accion: 'Prueba sintética 350', detalle: 'Sólo demo' })
    assert.equal(buscarClienteDemo(seed.id).name, 'Nombre override')
    assert.equal(buscarClienteDemo(seed.id).email, 'override@example.invalid')
    assert.equal(buscarClienteDemo(seed.id).demoProfile.orders[0].id, order.id)
    assert.ok(buscarClienteDemo(seed.id).demoProfile.timeline.some(event => event.id === interaction.id))
    assert.ok(buscarClienteDemo(seed.id).demoProfile.timeline.some(event => event.id === `${order.id}-timeline`))
    assert.equal(sincronizarPedidoDemoConVenta({ clienteId: seed.id, numero: order.orderNumber, total: 10000, totalPagado: 10000 }), true)
    assert.equal(buscarClienteDemo(seed.id).demoProfile.orders[0].collectedPyg, 10000)
    assert.equal(buscarClienteDemo(seed.id).demoProfile.orders[0].pendingPyg, 0)
    assert.equal(buscarClienteDemo(seed.id).email, 'override@example.invalid')
    const serial = 'DEMO350-REPORT'
    registrarInformeDemo(seed.id, { serial, canal: 'EMAIL' })
    registrarVistoInformeDemo(seed.id, serial)
    assert.equal(filaInformeDemo(serial).viewCount, 1)
    assert.equal(filaInformeDemo(serial).channel, 'EMAIL')
    const account = demoCuentaPayload(`demo-${seed.id}-completo`)
    assert.equal(account.customer.name, 'Nombre override')
    assert.ok(buscarClienteDemo(seed.id).demoProfile.notices.every(notice => notice.firstViewedAt))
    assert.equal(JSON.stringify(seed), before)
    assert.equal(storageAccesses, 0)
    limpiarMemoriaDemo()
    assert.equal(filaInformeDemo(serial), null)
    assert.equal(buscarClienteDemo(seed.id).name, seed.name)
    assert.equal(JSON.stringify(seed), before)
  } finally {
    limpiarMemoriaDemo()
    if (previousStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousStorage
  }
})
