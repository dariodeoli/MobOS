import assert from 'node:assert/strict'
import test from 'node:test'
import { assertSplitMatches, CLOSED_SHIFT_AFFECTS_DRAWER, correctionBlock, drawerFlags, parseCorrectionBody } from '../lib/payment-corrections'
import { canCorrectPayment, canEverCorrectPayments, staffCorrectsPaymentsFrom } from '../lib/payment-correction-policy'

// Corrección del medio de pago (#393): reglas puras de montos, turno y permisos.

const original = { method: 'CASH', status: 'CONFIRMED', amountPyg: 300000n, currency: 'PYG' as string | null, dueAt: null, reversalOfId: null, correctionId: null }

test('parseCorrectionBody: motivo de 3 a 500 caracteres y pagos con monto entero positivo', () => {
  const ok = parseCorrectionBody({ reason: ' Se cobró por transferencia ', payments: [{ accountId: 'acc-1', amount: 300000 }, { accountId: 'acc-2', amount: 1, toDriver: true }] })
  assert.equal(ok.reason, 'Se cobró por transferencia')
  assert.deepEqual(ok.rows, [{ accountId: 'acc-1', amountPyg: 300000, toDriver: false }, { accountId: 'acc-2', amountPyg: 1, toDriver: true }])
  for (const reason of ['', 'ab', 'x'.repeat(501), 5, null]) assert.throws(() => parseCorrectionBody({ reason, payments: [{ accountId: 'a', amount: 1 }] }), /Motivo|motivo/)
  for (const payments of [undefined, [], 'x', Array.from({ length: 11 }, () => ({ accountId: 'a', amount: 1 }))]) assert.throws(() => parseCorrectionBody({ reason: 'motivo', payments }), /entre 1 y 10/)
  for (const amount of [0, -5, 1.5, '300000', NaN, Infinity, 2 ** 60]) assert.throws(() => parseCorrectionBody({ reason: 'motivo', payments: [{ accountId: 'a', amount }] }), /entero positivo/)
  assert.throws(() => parseCorrectionBody({ reason: 'motivo', payments: [{ accountId: 'a', amount: 1, toDriver: 'si' }] }), /toDriver/)
  assert.throws(() => parseCorrectionBody({ reason: 'motivo', payments: [{ accountId: 'a', amount: 1 }], extra: 1 }), /no admitidos/)
  assert.throws(() => parseCorrectionBody({ reason: 'motivo', payments: [{ accountId: 'a', amount: 1, status: 'PENDING' }] }), /no admitidos/)
})

test('assertSplitMatches: los pagos nuevos suman exactamente el original', () => {
  assertSplitMatches(300000, [{ amountPyg: 300000 }])
  assertSplitMatches(300000, [{ amountPyg: 100000 }, { amountPyg: 150000 }, { amountPyg: 50000 }])
  assert.throws(() => assertSplitMatches(300000, [{ amountPyg: 299999 }]), /sumar exactamente/)
  assert.throws(() => assertSplitMatches(300000, [{ amountPyg: 200000 }, { amountPyg: 100001 }]), /sumar exactamente/)
})

test('correctionBlock: segunda corrección 409, medios no soportados 422', () => {
  assert.equal(correctionBlock(original, false), null)
  assert.equal(correctionBlock(original, true)?.status, 409)
  assert.equal(correctionBlock({ ...original, correctionId: 'c1' }, false)?.status, 409)
  assert.equal(correctionBlock({ ...original, reversalOfId: 'p0' }, false)?.status, 409)
  assert.equal(correctionBlock({ ...original, status: 'PENDING' }, false)?.status, 409)
  for (const method of ['TRADE_IN', 'STORE_CREDIT', 'GIFT_CARD', 'CREDIT', 'CRYPTO']) assert.equal(correctionBlock({ ...original, method }, false)?.status, 422, method)
  assert.equal(correctionBlock({ ...original, dueAt: new Date() }, false)?.status, 422)
  assert.equal(correctionBlock({ ...original, currency: 'USD' }, false)?.status, 422)
  assert.equal(correctionBlock({ ...original, currency: null }, false), null)
  for (const method of ['TRANSFER', 'CARD', 'PIX']) assert.equal(correctionBlock({ ...original, method }, false), null, method)
})

test('drawerFlags: turno abierto neta en el turno; cerrado solo reportes (constante)', () => {
  assert.deepEqual(drawerFlags(true), { originSessionClosed: false, drawerImpact: true })
  assert.deepEqual(drawerFlags(false), { originSessionClosed: true, drawerImpact: CLOSED_SHIFT_AFFECTS_DRAWER })
  assert.equal(CLOSED_SHIFT_AFFECTS_DRAWER, false, 'por defecto el cierre guardado y el arqueo de hoy no se tocan')
})

test('staffCorrectsPaymentsFrom: ausente = habilitado, solo false lo apaga', () => {
  for (const settings of [undefined, null, {}, [], 'x', { permissions: {} }, { permissions: [] }, { permissions: { staffCorrectsPayments: true } }]) assert.equal(staffCorrectsPaymentsFrom(settings), true, JSON.stringify(settings))
  assert.equal(staffCorrectsPaymentsFrom({ permissions: { staffCorrectsPayments: false } }), false)
})

const target = { userId: 'u-caja', createdById: 'u-caja', reconciliationState: null, originSessionOpen: true } as const
const OFF = { permissions: { staffCorrectsPayments: false } }

test('política: ADMIN y GERENTE corrigen cualquier pago, incluso de turno cerrado', () => {
  for (const role of ['ADMIN', 'GERENTE']) {
    assert.equal(canCorrectPayment({ id: 'otro', role }, { ...target, originSessionOpen: false }, OFF).allowed, true, role)
    assert.equal(canCorrectPayment({ id: 'otro', role }, { ...target, reconciliationState: 'PENDING' }).allowed, true, role)
  }
})

test('política: VERIFIED solo lo corrige ADMIN', () => {
  const verified = { ...target, reconciliationState: 'VERIFIED' as const }
  assert.equal(canCorrectPayment({ id: 'a', role: 'ADMIN' }, verified).allowed, true)
  for (const role of ['GERENTE', 'CAJERA', 'VENDEDOR']) assert.equal(canCorrectPayment({ id: 'u-caja', role }, verified).allowed, false, role)
})

test('política: VENDEDOR/CAJERA solo pagos propios del turno abierto y con el ajuste habilitado', () => {
  for (const role of ['VENDEDOR', 'CAJERA']) {
    const me = { id: 'u-caja', role }
    assert.equal(canCorrectPayment(me, target).allowed, true, `${role} propio`)
    assert.equal(canCorrectPayment(me, target, { permissions: { staffCorrectsPayments: true } }).allowed, true)
    assert.equal(canCorrectPayment(me, target, OFF).allowed, false, `${role} con el ajuste apagado`)
    assert.equal(canCorrectPayment({ id: 'u-otro', role }, target).allowed, false, `${role} pago ajeno`)
    assert.equal(canCorrectPayment(me, { ...target, originSessionOpen: false }).allowed, false, `${role} turno cerrado`)
    assert.equal(canCorrectPayment(me, { ...target, userId: null, createdById: 'u-caja' }).allowed, true, `${role} createdById`)
    assert.equal(canCorrectPayment(me, { ...target, userId: null, createdById: null }).allowed, false, `${role} sin responsable`)
  }
})

test('política: REPARTIDOR y roles desconocidos nunca', () => {
  for (const role of ['REPARTIDOR', 'TECNICO', '', null, undefined]) {
    assert.equal(canCorrectPayment({ id: 'u-caja', role }, target).allowed, false, String(role))
    assert.equal(canEverCorrectPayments(role), false, String(role))
  }
  for (const role of ['ADMIN', 'GERENTE', 'VENDEDOR', 'CAJERA']) assert.equal(canEverCorrectPayments(role), true, role)
})
