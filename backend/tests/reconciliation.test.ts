import assert from 'node:assert/strict'
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
