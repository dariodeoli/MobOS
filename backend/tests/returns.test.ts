import assert from 'node:assert/strict'
import test from 'node:test'
import { planReposicion, resolveRefundPyg, returnRequest } from '../lib/returns'
import { aggregateCommissions } from '../lib/reporting'

// Bordes del cálculo de devoluciones: reembolso total y parcial, reposición por
// unidad (seriales con decisión propia), nota de crédito y la comisión del
// vendedor cuando la devolución es completa. Las funciones son puras (salvo el
// agregado de comisiones, que ya está probado aparte), así que cubren la regla
// sin tocar la base.

const venta = (overrides: Record<string, unknown> = {}) => ({
  operation: 'RETURN',
  reason: 'Equipo con falla de fábrica',
  ...overrides,
})

test('el reembolso por defecto es todo lo cobrado', () => {
  assert.equal(resolveRefundPyg({ operation: 'RETURN', confirmedPyg: 300000, requestedPyg: undefined }), 300000)
  assert.equal(resolveRefundPyg({ operation: 'CANCEL', confirmedPyg: 150000, requestedPyg: undefined }), 150000)
})

test('el reembolso parcial se respeta y nunca supera lo cobrado', () => {
  assert.equal(resolveRefundPyg({ operation: 'RETURN', confirmedPyg: 300000, requestedPyg: 120000 }), 120000)
  assert.equal(resolveRefundPyg({ operation: 'RETURN', confirmedPyg: 300000, requestedPyg: 0 }), 0)
  assert.throws(
    () => resolveRefundPyg({ operation: 'RETURN', confirmedPyg: 300000, requestedPyg: 300001 }),
    /no puede superar el total cobrado/i,
  )
})

test('un cambio no devuelve dinero aunque se pida un monto', () => {
  assert.equal(resolveRefundPyg({ operation: 'EXCHANGE', confirmedPyg: 300000, requestedPyg: 300000 }), 0)
})

test('la devolución con saldo a favor exige cliente y no es un cambio', () => {
  const conCredito = returnRequest(venta({ refundMode: 'CREDIT', refundPyg: 50000 }))
  assert.equal(conCredito.refundMode, 'CREDIT')
  assert.equal(conCredito.refundPyg, 50000)
  const conReembolso = returnRequest(venta({ refundMode: 'CASH' }))
  assert.equal(conReembolso.refundMode, 'CASH')
  assert.equal(conReembolso.refundPyg, undefined)
  assert.throws(() => returnRequest(venta({ operation: 'EXCHANGE', replacementOrderNumber: 'MOB-2', refundMode: 'CREDIT' })), /no genera saldo a favor/i)
  assert.throws(() => returnRequest(venta({ refundMode: 'TRANSFER' })), /Modo de reembolso inválido/i)
})

test('la reposición general decide el destino de todos los seriales', () => {
  const items = [{ productId: 'p1', serials: ['IMEI1', 'IMEI2'] }, { productId: 'p2', serials: ['IMEI3'] }]
  const disponible = planReposicion({ restock: 'AVAILABLE', units: [], items })
  assert.deepEqual(disponible.available, [
    { productId: 'p1', serial: 'IMEI1' },
    { productId: 'p1', serial: 'IMEI2' },
    { productId: 'p2', serial: 'IMEI3' },
  ])
  assert.deepEqual(disponible.review, [])
  const revision = planReposicion({ restock: 'REVIEW', units: [], items })
  assert.equal(revision.review.length, 3)
  assert.equal(revision.available.length, 0)
})

test('sin reponer, los seriales quedan sin tocar', () => {
  const plan = planReposicion({ restock: 'NONE', units: [], items: [{ productId: 'p1', serials: ['IMEI1'] }] })
  assert.deepEqual(plan.available, [])
  assert.deepEqual(plan.review, [])
})

test('la decisión por unidad gana sobre la general y tolera el IMEI con separadores', () => {
  const items = [{ productId: 'p1', serials: ['IMEI1', 'IMEI2', 'IMEI3'] }]
  const plan = planReposicion({
    restock: 'AVAILABLE',
    units: [
      { serial: 'imei-2', decision: 'REVIEW' },
      { serial: 'IMEI-3', decision: 'AVAILABLE' },
    ],
    items,
  })
  assert.deepEqual(plan.available.map(unit => unit.serial).sort(), ['IMEI1', 'IMEI3'])
  assert.deepEqual(plan.review.map(unit => unit.serial), ['IMEI2'])
})

test('con decisión general NONE igual se puede reponer una unidad puntual', () => {
  const plan = planReposicion({
    restock: 'NONE',
    units: [{ serial: 'IMEI9', decision: 'REVIEW' }],
    items: [{ productId: 'p1', serials: ['IMEI9', 'IMEI8'] }],
  })
  assert.deepEqual(plan.review, [{ productId: 'p1', serial: 'IMEI9' }])
  assert.deepEqual(plan.available, [])
})

test('una serie ajena a la venta se rechaza', () => {
  assert.throws(
    () => planReposicion({ restock: 'AVAILABLE', units: [{ serial: 'AJENA', decision: 'AVAILABLE' }], items: [{ productId: 'p1', serials: ['IMEI1'] }] }),
    /no pertenecen a la venta/i,
  )
})

test('las decisiones por unidad no admiten series repetidas ni estados raros', () => {
  assert.throws(() => returnRequest(venta({ restockUnits: [{ serial: 'IMEI-1', decision: 'AVAILABLE' }, { serial: 'imei1', decision: 'REVIEW' }] })), /no puede repetirse/i)
  assert.throws(() => returnRequest(venta({ restockUnits: [{ serial: 'IMEI1', decision: 'SOLD' }] })), /AVAILABLE \(apto\) o REVIEW/i)
  assert.throws(() => returnRequest(venta({ restockUnits: [{ decision: 'AVAILABLE' }] })), /Serie debe ser texto/i)
})

test('la devolución completa cancela el pedido y la comisión deja de liquidarse', () => {
  const regla = [{ userId: 'v1', percentPyg: 10 }]
  const vendedores = { v1: { name: 'Vendedor Uno', role: 'VENDEDOR' } }
  const orden = {
    id: 'o1', status: 'COMPLETED', subtotalPyg: 400000, totalPyg: 400000, sellerId: 'v1',
    createdAt: '2026-09-10T15:00:00.000Z',
    items: [{ productId: 'p1', description: 'Equipo', quantity: 1, unitCostPyg: 300000, totalPyg: 400000 }],
  }
  const antes = aggregateCommissions([orden], regla, vendedores)
  assert.equal(antes.sellers[0].commissionPyg, 10000)
  const devuelta = aggregateCommissions([{ ...orden, status: 'CANCELLED' }], regla, vendedores)
  assert.equal(devuelta.sellers.length, 0)
  assert.equal(devuelta.totals.commissionPyg, 0)
})
