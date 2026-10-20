import test from 'node:test'
import assert from 'node:assert/strict'
import { guardarFichaClienteDemo } from './demoCheckoutCustomer.js'
import { buscarClienteDemo, listarClientesDemo, SEED_DEMO_CLIENTES } from './demoClientes.js'
import { limpiarMemoriaDemo } from './demoStorage.js'

test('saving a demo card creates a demo id, edits in place, preserves fiscal bytes and resets', () => {
  limpiarMemoriaDemo()
  try {
    const official = `  ${'FISCAL; '.repeat(240)}  `
    const saved = guardarFichaClienteDemo({ name: official, displayName: 'Mostrador demo', nameOfficial: official, addresses: [] })
    assert.match(saved.id, /^demo-cliente-/)
    assert.equal(saved.name, 'Mostrador demo')
    assert.equal(saved.nameOfficial, official)
    assert.deepEqual(saved.demoProfile.orders, [])
    assert.deepEqual(saved.demoProfile.timeline, [])
    const changed = guardarFichaClienteDemo({ ...saved, name: 'Mostrador corregido', displayName: 'Mostrador corregido', addresses: [{ address: 'Calle sintética 350' }] })
    assert.equal(changed.id, saved.id)
    assert.equal(listarClientesDemo().filter(row => row.id === saved.id).length, 1)
    assert.equal(buscarClienteDemo(saved.id).addresses[0].address, 'Calle sintética 350')
    assert.equal(buscarClienteDemo(saved.id).nameOfficial, official)
    limpiarMemoriaDemo()
    assert.equal(buscarClienteDemo(saved.id), null)
  } finally { limpiarMemoriaDemo() }
})

test('demo validation shares visible/fiscal limits and never claims invalid or missing cards were saved', () => {
  limpiarMemoriaDemo()
  const count = listarClientesDemo().length
  try {
    for (const invalid of [{ name: '' }, { name: 'x'.repeat(201) }, { name: 'Visible', nameOfficial: 'x'.repeat(2001) }, { name: 'x'.repeat(300), nameOfficial: 'x'.repeat(300), displayName: '' }, { id: 'not-demo-customer', name: 'Visible' }, { name: 'Persona', identityKind: 'PERSON', givenNames: 'Persona', surnames: 'Demo', personConfirmed: false }]) {
      assert.throws(() => guardarFichaClienteDemo(invalid))
      assert.equal(listarClientesDemo().length, count)
    }
    const official = ` ${'x'.repeat(1998)} `
    const accepted = guardarFichaClienteDemo({ name: 'v'.repeat(200), displayName: 'v'.repeat(200), nameOfficial: official })
    assert.equal(accepted.name.length, 200)
    assert.equal(accepted.nameOfficial, official)
    const seed = SEED_DEMO_CLIENTES[0]
    const before = JSON.stringify(seed)
    const edited = guardarFichaClienteDemo({ ...seed, name: 'Seed corregido', displayName: 'Seed corregido' })
    assert.equal(edited.id, seed.id)
    assert.equal(JSON.stringify(seed), before)
  } finally { limpiarMemoriaDemo() }
})
