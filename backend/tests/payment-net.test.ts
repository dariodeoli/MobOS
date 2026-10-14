import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_OFFSET_MINUTES, aggregateReport } from '../lib/reporting'
import { countFlags, countablePayments, signedOriginalAmount, sumConfirmed } from '../lib/payment-net-pure'
import { sqlCountable, sqlDrawer } from '../lib/payment-net'

// Neteo de correcciones de pago (#393-B): sumas con signo, conteos sin el par
// original + reversión y fragmentos SQL compartidos.

const original = { id: 'p1', reversalOfId: null, status: 'CONFIRMED', amountPyg: 300000, method: 'CASH' }
const reversion = { id: 'p2', reversalOfId: 'p1', status: 'CONFIRMED', amountPyg: -300000, method: 'CASH' }
const nuevo = { id: 'p3', reversalOfId: null, status: 'CONFIRMED', amountPyg: 300000, method: 'TRANSFER' }

test('sumConfirmed netea por el signo de amountPyg y respeta el estado', () => {
  assert.equal(sumConfirmed([original, reversion, nuevo]), 300000)
  assert.equal(sumConfirmed([original, reversion, { ...nuevo, status: 'PENDING' }]), 0)
  assert.equal(sumConfirmed([{ amountPyg: 5n }, { amountPyg: 7 }]), 12)
})

test('countablePayments y countFlags sacan la reversión y el original revertido', () => {
  assert.deepEqual(countablePayments([original, reversion, nuevo]).map((pago) => pago.id), ['p3'])
  assert.deepEqual(countFlags([original, reversion, nuevo]).map((pago) => pago.countable), [false, false, true])
  // Sin corrección todo cuenta; una reversión suelta (su original fuera de la lista) no.
  assert.equal(countablePayments([original]).length, 1)
  assert.deepEqual(countablePayments([reversion, nuevo]).map((pago) => pago.id), ['p3'])
})

test('signedOriginalAmount toma el signo de la reversión (originalAmount viene positivo)', () => {
  assert.equal(signedOriginalAmount({ originalAmount: '300000', amountPyg: 300000, reversalOfId: null }), 300000)
  assert.equal(signedOriginalAmount({ originalAmount: '300000', amountPyg: -300000, reversalOfId: 'p1' }), -300000)
  assert.equal(signedOriginalAmount({ originalAmount: null, amountPyg: 1000 }), 1000)
})

test('reporte por pagos: el monto netea y el conteo excluye el par', () => {
  const orden = {
    id: 'o1', status: 'COMPLETED', subtotalPyg: 300000, discountPyg: 0, deliveryPyg: 0, totalPyg: 300000, sellerId: 'v1', sellerName: 'V', createdAt: '2026-09-10T15:00:00.000Z',
    items: [], payments: [original, reversion, nuevo],
  }
  const porMedio = aggregateReport([orden], { groupBy: 'payments', offsetMinutes: DEFAULT_OFFSET_MINUTES, paymentsBy: 'method' })
  assert.equal(porMedio.totals.units, 1, 'un solo pago vigente')
  assert.equal(porMedio.totals.collectedPyg, 300000)
  const efectivo = porMedio.groups.find((grupo) => grupo.label === 'CASH')!
  assert.equal(efectivo.collectedPyg, 0, 'efectivo: +300000 y -300000')
  assert.equal(efectivo.units, 0)
  assert.equal(porMedio.groups.find((grupo) => grupo.label === 'TRANSFER')!.units, 1)
  // Por vendedor, lo cobrado es la suma con signo.
  assert.equal(aggregateReport([orden], { groupBy: 'seller', offsetMinutes: DEFAULT_OFFSET_MINUTES }).totals.collectedPyg, 300000)
})

test('fragmentos SQL compartidos usan el alias pedido', () => {
  assert.match(sqlCountable('pay').sql, /pay\."reversalOfId" IS NULL AND NOT EXISTS .* rv\."reversalOfId" = pay\."id"/)
  assert.match(sqlDrawer('pay').sql, /pcx\."id" = pay\."correctionId" AND pcx\."drawerImpact" = false/)
})
