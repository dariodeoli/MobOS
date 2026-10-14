import assert from 'node:assert/strict'
import test from 'node:test'
import { mergePreferences, parsePreferencesPatch, preferencesFrom, PREPARED_FULFILLMENT } from '../lib/tenant-preferences'

test('preferencesFrom: sin ajustes se conserva el comportamiento de siempre', () => {
  for (const settings of [undefined, null, {}, [], 'x', { orders: [] }, { portal: 3 }]) {
    assert.deepEqual(preferencesFrom(settings), { orders: { autoArchivePrepared: false }, portal: { showStoreCredit: true } }, JSON.stringify(settings))
  }
})

test('preferencesFrom: lee solo booleanos exactos', () => {
  assert.equal(preferencesFrom({ orders: { autoArchivePrepared: true } }).orders.autoArchivePrepared, true)
  assert.equal(preferencesFrom({ orders: { autoArchivePrepared: 'true' } }).orders.autoArchivePrepared, false)
  assert.equal(preferencesFrom({ portal: { showStoreCredit: false } }).portal.showStoreCredit, false)
  assert.equal(preferencesFrom({ portal: { showStoreCredit: 0 } }).portal.showStoreCredit, true)
})

test('parsePreferencesPatch: acepta solo claves conocidas y booleanas', () => {
  assert.deepEqual(parsePreferencesPatch({ orders: { autoArchivePrepared: true } }), { orders: { autoArchivePrepared: true } })
  assert.deepEqual(parsePreferencesPatch({ portal: { showStoreCredit: false }, extra: 1 }), { portal: { showStoreCredit: false } })
  for (const body of [null, {}, [], 'x', { orders: {} }, { orders: { autoArchivePrepared: 'si' } }, { orders: { otro: true } }, { portal: { showStoreCredit: 1 } }]) {
    assert.equal(parsePreferencesPatch(body), null, JSON.stringify(body))
  }
})

test('mergePreferences conserva el resto de Tenant.settings', () => {
  const settings = { permissions: { sellerSeesCosts: false }, onboarding: { adminPinPending: true }, orders: { otraCosa: 1 } }
  const merged = mergePreferences(settings, { orders: { autoArchivePrepared: true } })
  assert.deepEqual(merged, { permissions: { sellerSeesCosts: false }, onboarding: { adminPinPending: true }, orders: { otraCosa: 1, autoArchivePrepared: true } })
  assert.deepEqual(mergePreferences(null, { portal: { showStoreCredit: false } }), { portal: { showStoreCredit: false } })
  assert.deepEqual(settings.orders, { otraCosa: 1 }, 'no muta el original')
})

test('PREPARED_FULFILLMENT: solo pedidos listos o retirados, nunca los que siguen en camino', () => {
  assert.deepEqual([...PREPARED_FULFILLMENT], ['READY_TO_SHIP', 'READY_FOR_PICKUP', 'PICKED_UP'])
  for (const enCurso of ['PENDING', 'PROCESSING', 'SHIPPED', 'IN_TRANSIT', 'PARTIAL']) assert.ok(!(PREPARED_FULFILLMENT as readonly string[]).includes(enCurso))
})
