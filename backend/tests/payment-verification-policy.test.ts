import assert from 'node:assert/strict'
import { canVerifyPayments, decideInitialPaymentState, defaultPaymentVerificationSettings, effectivePendingReason, isOwnPayment, mayApproveOwnPayment, parsePaymentVerification, requiresVerification } from '../lib/payment-verification-policy'
import { newCompanySettings } from '../lib/module-store'

// Empresas existentes (sin la clave): todo automático, nada cambia.
for (const settings of [undefined, null, {}, { paymentVerification: null }, { paymentVerification: [] }, 'x', 7]) {
  const policy = parsePaymentVerification(settings)
  assert.deepEqual(Object.values(policy.methods).filter(mode => mode !== 'auto'), [], 'existentes: todo en automático')
  assert.deepEqual(policy.selfApproveRoles, [])
  assert.equal(requiresVerification(policy, { method: 'PIX' }), false)
  assert.equal(decideInitialPaymentState(policy, { method: 'PIX', role: 'VENDEDOR', requestedStatus: 'CONFIRMED' }).status, 'CONFIRMED')
}

// Empresas nuevas: PIX, USDT y transferencia en «verificar»; efectivo y tarjeta en automático.
const nueva = parsePaymentVerification({ paymentVerification: defaultPaymentVerificationSettings() })
assert.equal(nueva.methods.PIX, 'verificar')
assert.equal(nueva.methods.CRYPTO, 'verificar')
assert.equal(nueva.methods.TRANSFER, 'verificar')
assert.equal(nueva.methods.CARD, 'auto')
assert.equal(requiresVerification(nueva, { method: 'CASH' }), false)
assert.equal(nueva.requireProof, true)
assert.equal(nueva.blockDelivery, true)
const creada = parsePaymentVerification(newCompanySettings({ onboarding: {} }))
assert.equal(creada.methods.PIX, 'verificar', 'newCompanySettings guarda la política de las empresas nuevas')

// El cliente no puede forzar CONFIRMED sobre un medio que pide verificación.
const pix = decideInitialPaymentState(nueva, { method: 'PIX', role: 'VENDEDOR', requestedStatus: 'CONFIRMED' })
assert.deepEqual(pix, { status: 'PENDING', pendingReason: 'VERIFICACION', selfApproved: false })
assert.equal(decideInitialPaymentState(nueva, { method: 'TRANSFER', role: 'ADMIN' }).status, 'PENDING', 'ni el administrador se autoaprueba sin configuración')
assert.equal(decideInitialPaymentState(nueva, { method: 'CASH', role: 'VENDEDOR', requestedStatus: 'CONFIRMED' }).status, 'CONFIRMED')
// Pedir «pendiente» en un medio automático: queda MANUAL (CUOTA si es crédito).
assert.deepEqual(decideInitialPaymentState(nueva, { method: 'CASH', requestedStatus: 'PENDING' }), { status: 'PENDING', pendingReason: 'MANUAL', selfApproved: false })
assert.equal(decideInitialPaymentState(nueva, { method: 'CREDIT', requestedStatus: 'PENDING' }).pendingReason, 'CUOTA')

// La cuenta manda sobre el medio; valores inválidos caen a automático; CASH nunca se verifica.
const porCuenta = parsePaymentVerification({ paymentVerification: { methods: { PIX: 'verificar', CASH: 'verificar', CARD: 'raro' }, accounts: { 'acc-1': 'auto', 'acc-2': 'verificar', 'acc-3': 'zzz' } } })
assert.equal(porCuenta.methods.CARD, 'auto')
assert.equal(requiresVerification(porCuenta, { method: 'CASH' }), false)
assert.equal(requiresVerification(porCuenta, { method: 'PIX', accountId: 'acc-1' }), false)
assert.equal(requiresVerification(porCuenta, { method: 'PIX', accountId: 'otra' }), true)
assert.equal(requiresVerification(porCuenta, { method: 'CARD', accountId: 'acc-2' }), true)
assert.equal(porCuenta.accounts['acc-3'], undefined)

// selfApproveRoles: solo roles conocidos; ese rol queda SELF, el resto pendiente.
const propio = parsePaymentVerification({ paymentVerification: { methods: { PIX: 'verificar' }, selfApproveRoles: ['ADMIN', 'DIOS', 7] } })
assert.deepEqual(propio.selfApproveRoles, ['ADMIN'])
assert.deepEqual(decideInitialPaymentState(propio, { method: 'PIX', role: 'ADMIN', requestedStatus: 'CONFIRMED' }), { status: 'CONFIRMED', pendingReason: 'VERIFICACION', selfApproved: true })
assert.equal(decideInitialPaymentState(propio, { method: 'PIX', role: 'GERENTE' }).status, 'PENDING')
assert.equal(mayApproveOwnPayment(propio, 'ADMIN'), true)
assert.equal(mayApproveOwnPayment(propio, 'CAJERA'), false)

// Quién verifica: gerente, administrador y caja.
assert.deepEqual(['ADMIN', 'GERENTE', 'CAJERA', 'VENDEDOR', 'REPARTIDOR'].map(canVerifyPayments), [true, true, true, false, false])

// PENDING viejo sin motivo = MANUAL, nunca VERIFICACION.
assert.equal(effectivePendingReason(null), 'MANUAL')
assert.equal(effectivePendingReason(undefined), 'MANUAL')
assert.equal(effectivePendingReason('algo'), 'MANUAL')
assert.equal(effectivePendingReason('VERIFICACION'), 'VERIFICACION')

// Pago propio: lo creó, lo cobró o lo cobró en la calle.
assert.equal(isOwnPayment({ createdById: 'u1', userId: null }, 'u1'), true)
assert.equal(isOwnPayment({ createdById: 'u2', userId: 'u1' }, 'u1'), true)
assert.equal(isOwnPayment({ createdById: 'u2', deliveryUserId: 'u1' }, 'u1'), true)
assert.equal(isOwnPayment({ createdById: 'u2', userId: 'u3' }, 'u1'), false)
assert.equal(isOwnPayment({}, 'u1'), false)

console.log('payment-verification-policy.test.ts: ok')
