import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { limpiarMemoriaDemo } from './demoStorage.js'
import { buildDemoProfile } from './demoClientes.js'
import { guardarIdentidadFacturacionDemo } from './demoBillingIdentities.js'

const official = '  PÉREZ, JUAN; EMPRESA S.A.  '
const customer = { id: 'demo-fiscal-498', name: 'Mostrador', demoProfile: { billingIdentities: [{ id: 'previa', name: 'Anterior', document: '123', uses: 4, lastUsedAt: '2026-10-01T00:00:00Z' }] } }
beforeEach(() => limpiarMemoriaDemo())
test('guardar y reabrir perfil demo conserva identidad exacta sin modificar seed ni almacenamiento real', () => {
  const original = JSON.stringify(customer)
  const previousStorage = globalThis.localStorage
  globalThis.localStorage = { getItem() { throw new Error('No leer almacenamiento real') }, setItem() { throw new Error('No escribir almacenamiento real') } }
  try {
    const created = guardarIdentidadFacturacionDemo(customer, { name: official, document: ' 80012345-0 ' }, { actorId: 'demo-user', now: '2026-10-15T12:00:00Z', id: 'nueva' })
    const reopened = buildDemoProfile(JSON.parse(original))
    assert.equal(created.name, official)
    assert.equal(created.document, '80012345-0')
    assert.equal(created.createdById, 'demo-user')
    assert.equal(created.createdAt, '2026-10-15T12:00:00Z')
    assert.equal(created.uses, 0)
    assert.equal(created.lastUsedAt, null)
    assert.deepEqual(reopened.billingIdentities, [...customer.demoProfile.billingIdentities, created])
    assert.equal(JSON.stringify(customer), original)
    assert.deepEqual(buildDemoProfile({ ...customer, id: 'otro' }).billingIdentities, customer.demoProfile.billingIdentities)
    reopened.billingIdentities[1].name = 'No mutar guardado'
    assert.equal(buildDemoProfile(customer).billingIdentities[1].name, official)
  } finally { globalThis.localStorage = previousStorage }
})
test('editar conserva id/fecha/uso y rechaza duplicados, ids ajenos y entradas inválidas sin escrituras', () => {
  const saved = guardarIdentidadFacturacionDemo(customer, { id: 'previa', name: official, document: '123' }, { now: '2026-10-15T12:00:00Z' })
  assert.equal(saved.uses, 4)
  assert.equal(saved.lastUsedAt, '2026-10-01T00:00:00Z')
  assert.equal(saved.updatedAt, '2026-10-15T12:00:00Z')
  const before = buildDemoProfile(customer).billingIdentities
  for (const form of [{ name: 'Duplicado', document: '123' }, { id: 'ajeno', name: 'Otro', document: '456' }, { name: ' ', document: '456' }, { name: 'X'.repeat(2001), document: '456' }, { name: 'Bien', document: 'X'.repeat(101) }]) {
    assert.throws(() => guardarIdentidadFacturacionDemo(customer, form))
    assert.deepEqual(buildDemoProfile(customer).billingIdentities, before)
  }
  limpiarMemoriaDemo()
  assert.deepEqual(buildDemoProfile(customer).billingIdentities, customer.demoProfile.billingIdentities)
})

test('misma ficha en otra empresa no comparte identidad demo guardada', () => {
  guardarIdentidadFacturacionDemo(customer, { name: official, document: '80012345-0' }, { empresaId: 'empresa-a' })
  assert.equal(buildDemoProfile(customer, { empresaId: 'empresa-a' }).billingIdentities.length, 2)
  assert.deepEqual(buildDemoProfile(customer, { empresaId: 'empresa-b' }).billingIdentities, customer.demoProfile.billingIdentities)
})
