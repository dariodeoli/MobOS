import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateDailyReconciliation } from '../lib/reconciliation'
import { parseDailyDeclarations, reconciliationDayRange } from '../lib/reconciliation-day'
import { processorOf, summarizeReconciliation, type ReconciliationPayment } from '../lib/reconciliation'

// #144: agrupación por cuenta/medio/procesadora, foto del pago sobre la cuenta
// actual y diferencias de los lotes repartidas en su grupo.

function pago(over: Partial<ReconciliationPayment>): ReconciliationPayment {
  return {
    id: 'pago-1',
    method: 'TRANSFER',
    status: 'CONFIRMED',
    amountPyg: 100000,
    currency: 'PYG',
    reference: null,
    accountId: 'cuenta-1',
    accountSnapshot: null,
    account: { id: 'cuenta-1', name: 'Itaú · Darío', kind: 'TRANSFER', bank: 'Itaú', holder: 'Darío', processor: null },
    reconciliation: null,
    ...over,
  }
}

const resumen = summarizeReconciliation(
  [
    // Confirmado y verificado.
    pago({ id: 'p1', reconciliation: { state: 'VERIFIED', note: null } }),
    // Confirmado por conciliar, con procesadora en la foto (la cuenta ya no la
    // tiene: la foto manda).
    pago({
      id: 'p2',
      method: 'CARD',
      amountPyg: 250000,
      accountId: 'cuenta-2',
      account: { id: 'cuenta-2', name: 'Tarjeta', kind: 'CARD', bank: null, holder: 'Empresa XYZ', processor: null },
      accountSnapshot: { id: 'cuenta-2', name: 'Tarjeta Bancard', kind: 'CARD', processor: 'Bancard', holder: 'Darío' },
    }),
    // Reembolsado.
    pago({ id: 'p3', status: 'REFUNDED', amountPyg: 30000 }),
    // Pendiente de aprobación (pre-cobro).
    pago({ id: 'p4', status: 'PENDING', amountPyg: 70000 }),
    // Efectivo sin cuenta: se agrupa por método.
    pago({ id: 'p5', method: 'CASH', accountId: null, account: null, amountPyg: 50000, reconciliation: { state: 'VERIFIED', note: null } }),
  ],
  [
    { accountId: 'cuenta-2', accountKind: 'CARD', processor: 'Bancard', differencePyg: -20000, state: 'VERIFIED' },
    { accountId: 'cuenta-x', accountKind: 'CASH', processor: null, differencePyg: 99999, state: 'REJECTED' },
  ],
)

assert.equal(resumen.totals.count, 5)
assert.equal(resumen.totals.confirmedPyg, 400000)
assert.equal(resumen.totals.verifiedPyg, 150000)
assert.equal(resumen.totals.unverifiedPyg, 250000)
assert.equal(resumen.totals.pendingPyg, 70000)
assert.equal(resumen.totals.refundedPyg, 30000)
assert.equal(resumen.totals.pendingCount, 1)
assert.equal(resumen.totals.verifiedCount, 2)
// Solo el lote vigente aporta diferencia; el rechazado se ignora.
assert.equal(resumen.totals.differencePyg, -20000)
assert.equal(resumen.totals.batches, 1)

const tarjeta = resumen.byAccount.find((fila) => fila.key === 'cuenta-2')!
assert.equal(tarjeta.label, 'Tarjeta Bancard')
assert.equal(tarjeta.secondary, 'Darío')
assert.equal(tarjeta.processor, 'Bancard')
assert.equal(tarjeta.unverifiedPyg, 250000)
assert.equal(tarjeta.differencePyg, -20000)

const efectivo = resumen.byAccount.find((fila) => fila.key === 'metodo:CASH')!
assert.equal(efectivo.label, 'Efectivo')
assert.equal(efectivo.verifiedPyg, 50000)

const porProcesadora = resumen.byProcessor.find((fila) => fila.key === 'Bancard')!
assert.equal(porProcesadora.unverifiedPyg, 250000)
assert.equal(porProcesadora.differencePyg, -20000)
assert.ok(resumen.byProcessor.some((fila) => fila.key === 'sin-procesadora'))

const transferencia = resumen.byMethod.find((fila) => fila.key === 'TRANSFER')!
assert.equal(transferencia.pendingPyg, 70000)
assert.equal(transferencia.refundedPyg, 30000)

// La foto manda: sin snapshot, cae a la cuenta actual.
assert.equal(processorOf(pago({ accountSnapshot: { processor: 'Dinelco' } })), 'Dinelco')
assert.equal(processorOf(pago({ accountSnapshot: null })), '')

console.log('Conciliación: resumen por cuenta, medio y procesadora OK (#144)')

const cash = { id: 'cash', method: 'CASH', accountId: null, currency: 'PYG', status: 'CONFIRMED', amountPyg: 100000 }
const declared = (method: string, accountId: string | null, receivedPyg: number) => ({ method, accountId, currency: 'PYG', receivedPyg })
test('día: sin declaración independiente queda pendiente aunque los cobros estén confirmados', () => {
  assert.equal(evaluateDailyReconciliation([cash], null).state, 'PENDING')
  assert.equal(evaluateDailyReconciliation([cash], null).groups[0].receivedPyg, null)
  assert.equal(evaluateDailyReconciliation([cash], [declared('CASH', null, 100000)]).state, 'VERIFIED')
  assert.equal(evaluateDailyReconciliation([cash, { ...cash }], [declared('CASH', null, 100000)]).expectedPyg, 100000)
})
test('día: diferencias opuestas no se compensan para marcar verde; cero debe declararse', () => {
  const transfer = { ...cash, id: 'transfer', method: 'TRANSFER', accountId: 'bank' }
  const result = evaluateDailyReconciliation([cash, transfer], [declared('CASH', null, 90000), declared('TRANSFER', 'bank', 110000)])
  assert.equal(result.differencePyg, 0); assert.equal(result.differences, 2); assert.equal(result.state, 'DIFFERENCE')
  assert.equal(evaluateDailyReconciliation([], null).state, 'PENDING')
  assert.equal(evaluateDailyReconciliation([], [declared('CASH', null, 0)]).state, 'VERIFIED')
  assert.equal(evaluateDailyReconciliation([transfer], [declared('TRANSFER', 'bank', 100000)]).state, 'PENDING')
})
test('día: reevalúa tras corrección y no toma pagos pendientes o crédito como recibido', () => {
  const declarations = [declared('CASH', null, 100000)]
  assert.equal(evaluateDailyReconciliation([cash], declarations).state, 'VERIFIED')
  assert.equal(evaluateDailyReconciliation([{ ...cash, amountPyg: 80000 }], declarations).differencePyg, 20000)
  const result = evaluateDailyReconciliation([{ ...cash, status: 'PENDING' }, { ...cash, id: 'credit', method: 'CREDIT' }], declarations)
  assert.equal(result.expectedPyg, 0); assert.equal(result.state, 'DIFFERENCE')
})
test('declaración: importe explícito entero en Gs, grupo único y USDT válido', () => {
  assert.deepEqual(parseDailyDeclarations([declared('CASH', null, 0)]), [declared('CASH', null, 0)])
  assert.equal(parseDailyDeclarations([{ ...declared('CRYPTO', 'crypto', 1000), currency: 'USDT' }])[0].currency, 'USDT')
  for (const receivedPyg of ['', null, undefined, -1, 1.5, '1000', Infinity]) assert.throws(() => parseDailyDeclarations([{ ...declared('CASH', null, 0), receivedPyg }]))
  assert.throws(() => parseDailyDeclarations([declared('CASH', null, 0), declared('CASH', null, 1)]))
  assert.throws(() => parseDailyDeclarations([{ ...declared('CASH', null, 0), currency: 'XYZ' }]))
})
test('día financiero: límites reales de Paraguay y rechazo de fechas inexistentes', () => {
  const range = reconciliationDayRange('2026-10-15')
  assert.equal(range.start.toISOString(), '2026-10-15T03:00:00.000Z')
  assert.equal(range.end.toISOString(), '2026-10-16T03:00:00.000Z')
  for (const day of ['2026-02-31', '2026-13-01', '2026-1-01', null]) assert.throws(() => reconciliationDayRange(day))
})
