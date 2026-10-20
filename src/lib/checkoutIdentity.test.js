import test from 'node:test'
import assert from 'node:assert/strict'
import { applyCheckoutIdentity, clearCheckoutIdentity, checkoutName, checkoutVisibleName, checkoutBillingPayload, restoreBillingIdentity } from './checkoutIdentity.js'

const official = '  GONZALEZ BENITEZ MARIA FERNANDA; S.A.  '
test('RUC aceptado conserva fiscal exacto y nombre de mostrador separado sin inferir persona', () => {
  const current = { name: 'Nombre manual', document: '123', identityKind: 'PERSON', givenNames: 'Viejo', surnames: 'Viejo', personConfirmed: true }
  const next = applyCheckoutIdentity(current, { name: 'NO USAR', nameOfficial: official, fullRuc: '80012345-0', identityKind: 'PERSON', givenNames: 'No inferir' })
  assert.equal(next.nameOfficial, official)
  assert.equal(next.name, official)
  assert.equal(next.displayName, 'Nombre manual')
  assert.equal(next.document, '80012345-0')
  assert.equal(next.identityKind, '')
  assert.equal(next.givenNames, '')
  assert.equal(next.personConfirmed, false)
  assert.equal(checkoutName(next), official)
  assert.deepEqual(current, { name: 'Nombre manual', document: '123', identityKind: 'PERSON', givenNames: 'Viejo', surnames: 'Viejo', personConfirmed: true })
})
test('titular sobrevive serialización/restauración y cambio manual invalida fiscal anterior', () => {
  const next = applyCheckoutIdentity({ name: '', document: '' }, { nameOfficial: official, fullRuc: '80012345-0' })
  const restored = restoreBillingIdentity(JSON.parse(JSON.stringify(next)))
  assert.equal(restored.nameOfficial, official)
  assert.equal(checkoutName(restored), official)
  const manual = { ...clearCheckoutIdentity(restored), name: 'Otro titular', document: '1234567' }
  assert.equal(checkoutName(manual), 'Otro titular')
  assert.equal(Object.hasOwn(manual, 'nameOfficial'), false)
  assert.deepEqual(restoreBillingIdentity(null), { name: '', document: '' })
})
test('sin nombre oficial no se inventa: mantiene flujo manual y legacy', () => {
  assert.equal(checkoutName({ name: 'JUAN PEREZ' }), 'Juan Perez')
  assert.equal(checkoutName(applyCheckoutIdentity({ name: 'Manual' }, { fullRuc: '1234567-9' })), 'Manual')
})

test('payload de titular preserva fiscal exacto y solo emite claves admitidas por orders', () => {
  const applied = applyCheckoutIdentity({ name: 'Mostrador' }, { nameOfficial: official, fullRuc: '80012345-0' })
  assert.deepEqual(checkoutBillingPayload(restoreBillingIdentity(JSON.parse(JSON.stringify(applied)))), { name: official, document: '80012345-0' })
  assert.deepEqual(checkoutBillingPayload({ name: ' EMPRESA S.A. ', document: ' 123 ' }), { name: 'EMPRESA S.A.', document: '123' })
})

test('nombre fiscal largo conserva puntuación, espacios y orden en formulario y payload de factura', () => {
  const raw = '  GONZALEZ BENITEZ MARIA FERNANDA · ' + 'SOCIEDAD ANÓNIMA; '.repeat(20) + '  '
  const form = applyCheckoutIdentity({ name: 'Mostrador' }, { nameOfficial: raw, fullRuc: '80012345-0' })
  const restored = restoreBillingIdentity(JSON.parse(JSON.stringify(form)))
  assert.equal(restored.nameOfficial, raw)
  assert.equal(checkoutName(restored), raw)
  assert.deepEqual(checkoutBillingPayload(restored), { name: raw, document: '80012345-0' })
})

test('nombre visible separado permite fiscal largo sin truncarlo', () => {
  const raw = '  ' + 'EMPRESA FISCAL; '.repeat(150)
  const form = applyCheckoutIdentity({ name: 'Mostrador', displayName: 'Mostrador' }, { nameOfficial: raw, fullRuc: '80012345-0' })
  assert.equal(checkoutVisibleName(form), 'Mostrador')
  assert.throws(() => checkoutVisibleName({ nameOfficial: raw, name: raw }, ''), /nombre visible/)
  assert.throws(() => checkoutVisibleName({ displayName: 'X'.repeat(201), nameOfficial: 'EMPRESA S.A.' }), /200 caracteres/)
})

test('cliente seleccionado conserva persona confirmada y permite empresa fiscal corta', () => {
  assert.equal(checkoutVisibleName({ name: 'ACME S.A.', nameOfficial: 'ACME S.A.' }), 'ACME S.A.')
  const selected = { name: 'Juan Pérez', nameOfficial: 'JUAN PEREZ', identityKind: 'PERSON', givenNames: 'Juan', surnames: 'Pérez', personConfirmed: true }
  assert.equal(checkoutVisibleName(selected), 'Juan Pérez')
})
