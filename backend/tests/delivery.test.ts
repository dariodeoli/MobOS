import assert from 'node:assert/strict'
import test from 'node:test'
import { InputError } from '../lib/payment-input'
import {
  assertCollectionWithinBalance,
  canManageDelivery,
  canUseDelivery,
  deliveryBalance,
  deliveryCoversTotal,
  deliveryMethod,
  deliverySummary,
} from '../lib/delivery'

const user = (permissions: string[]) => ({ permissions })

test('el repartidor solo tiene permiso de uso; la tienda solo de gestión', () => {
  assert.equal(canUseDelivery(user(['delivery:use'])), true)
  assert.equal(canManageDelivery(user(['delivery:use'])), false)
  assert.equal(canUseDelivery(user(['delivery:manage'])), false)
  assert.equal(canManageDelivery(user(['delivery:manage'])), true)
  assert.equal(canUseDelivery(user(['*'])), true)
  assert.equal(canManageDelivery(user(['*'])), true)
  assert.equal(canUseDelivery(user([])), false)
})

test('el cobro de la calle solo acepta efectivo o transferencia', () => {
  assert.equal(deliveryMethod('cash'), 'CASH')
  assert.equal(deliveryMethod(' Transfer '), 'TRANSFER')
  for (const invalido of ['CARD', 'CREDIT', 'PIX', '', null, 7]) {
    assert.throws(() => deliveryMethod(invalido), InputError)
  }
})

test('el saldo descuenta lo confirmado y lo pre-cobrado en la calle', () => {
  assert.deepEqual(deliveryBalance(100000, 30000, 20000), { paidPyg: 50000, pendingPyg: 50000 })
  assert.deepEqual(deliveryBalance(100000, 100000, 0), { paidPyg: 100000, pendingPyg: 0 })
  // Nunca un pendiente negativo aunque los pagos superen el total histórico.
  assert.deepEqual(deliveryBalance(100000, 120000, 0), { paidPyg: 120000, pendingPyg: 0 })
})

test('no se puede cobrar por encima del saldo', () => {
  assert.equal(assertCollectionWithinBalance(100000, 40000, 10000, 50000), 50000)
  assert.throws(() => assertCollectionWithinBalance(100000, 40000, 10000, 50001), InputError)
  assert.throws(() => assertCollectionWithinBalance(100000, 0, 0, 0), InputError)
  assert.throws(() => assertCollectionWithinBalance(100000, 0, 0, -5), InputError)
  // Un pedido ya saldado no admite más cobros.
  assert.throws(() => assertCollectionWithinBalance(100000, 100000, 0, 1), InputError)
})

test('el resumen separa lo confirmado de lo pre-cobrado sin verificar', () => {
  const resumen = deliverySummary({
    totalPyg: 100000,
    payments: [
      { amountPyg: 25000, status: 'CONFIRMED' },
      { amountPyg: 15000, status: 'PENDING', deliveryUserId: 'repartidor-1' },
      { amountPyg: 9000, status: 'PENDING', deliveryUserId: null },
      { amountPyg: 5000, status: 'REJECTED', deliveryUserId: 'repartidor-1' },
    ],
  })
  assert.deepEqual(resumen, { confirmedPyg: 25000, collectedPyg: 15000, paidPyg: 40000, pendingPyg: 60000 })
})

test('cobrar el total en la calle cubre el pedido sin dejar saldo', () => {
  assert.equal(deliveryCoversTotal(100000, 0, 100000), true)
  assert.equal(deliveryCoversTotal(100000, 60000, 40000), true)
  assert.equal(deliveryCoversTotal(100000, 60000, 39999), false)
})
