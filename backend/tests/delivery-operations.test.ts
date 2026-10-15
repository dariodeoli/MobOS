import assert from 'node:assert/strict'
import test from 'node:test'
import { dayInput, dayKey, localDay, parseTariff, quoteTrip, reasonInput, sumPyg, weekInput, weekOf, weeklyAmounts } from '../lib/delivery-operations'
import { branchScope } from '../lib/delivery-access'

const rate = { name: 'Octubre', validFrom: '2026-10-01', validUntil: '2026-10-31', tiers: [{ upToKm: 5, feePyg: 10000 }, { upToKm: 28, feePyg: 20000 }] }
test('tarifas explícitas: no precios inferidos y cobertura completa hasta 28 km', () => {
  assert.equal(parseTariff(rate).tiers[0].feePyg, 10000)
  for (const tiers of [[], [{ upToKm: 5, feePyg: 10000 }], [{ upToKm: 29, feePyg: 10000 }], [{ upToKm: 28, feePyg: '' }], [{ upToKm: 28 }], [{ upToKm: 28, feePyg: null }], [{ upToKm: 5, feePyg: 1 }, { upToKm: 5, feePyg: 2 }, { upToKm: 28, feePyg: 3 }]]) assert.throws(() => parseTariff({ ...rate, tiers }))
  assert.equal(parseTariff({ ...rate, tiers: [{ upToKm: 28, feePyg: 0 }] }).tiers[0].feePyg, 0, 'cero solo si se guarda explícitamente')
  assert.throws(() => parseTariff({ ...rate, validUntil: '2026-09-30' }))
  assert.throws(() => parseTariff({ ...rate, tenantId: 'otro' }))
})
test('límites de distancia, precisión y cantidad; honorario por viaje sin redondear Gs', () => {
  assert.deepEqual(quoteTrip(rate.tiers, 5, 3), { distanceMeters: 5000, tripsCount: 3, feePerTripPyg: 10000, totalFeePyg: 30000 })
  assert.equal(quoteTrip(rate.tiers, 5.001, 2).totalFeePyg, 40000)
  assert.equal(quoteTrip(rate.tiers, 28, 1).distanceMeters, 28000)
  for (const distance of [0, -1, 28.001, 5.0001, '5', NaN, Infinity, null]) assert.throws(() => quoteTrip(rate.tiers, distance, 1))
  for (const count of [0, -1, 101, 1.5, '2', null]) assert.throws(() => quoteTrip(rate.tiers, 5, count))
  for (const amount of [-1, 0.5, 99000000001, NaN]) assert.throws(() => parseTariff({ ...rate, tiers: [{ upToKm: 28, feePyg: amount }] }))
})
test('semana calendario de Paraguay, lunes y bordes nocturnos', () => {
  assert.equal(dayKey(weekOf(dayInput('2026-10-11'))), '2026-10-05')
  assert.equal(dayKey(weekInput('2026-10-05')), '2026-10-05')
  assert.throws(() => weekInput('2026-10-06'))
  assert.throws(() => dayInput('2026-02-30'))
  assert.equal(localDay(new Date('2026-10-12T01:00:00Z')), '2026-10-11')
  assert.equal(localDay(new Date('2026-10-12T04:00:00Z')), '2026-10-12')
})
test('varios viajes suman honorarios, el cobro de un pedido se cuenta una sola vez', () => {
  const payment = { id: 'p1', amountPyg: 100000n, status: 'PENDING', deliverySettlementId: 's1' }
  const amounts = weeklyAmounts(quoteTrip(rate.tiers, 5, 3).totalFeePyg, [payment, payment])
  assert.deepEqual(amounts, { feesPyg: 30000, collectedPyg: 100000, renderedPyg: 0, pendingPyg: 100000, adjustmentPyg: 0, balancePyg: -70000, payablePyg: 0, receivablePyg: 70000 })
})
test('rendición posterior cambia saldo actual sin alterar la foto del cierre ni recrear ingresos', () => {
  const original = { id: 'p1', amountPyg: 100000n, status: 'PENDING', deliverySettlementId: 's1' }
  const atClose = weeklyAmounts(30000, [original])
  const after = weeklyAmounts(30000, [{ ...original, status: 'CONFIRMED' }])
  assert.equal(atClose.balancePyg, -70000)
  assert.equal(after.balancePyg, 30000)
  assert.equal(after.collectedPyg, 100000)
  assert.equal(after.renderedPyg, 100000)
  assert.equal(after.pendingPyg, 0)
  assert.equal(original.status, 'PENDING')
  assert.equal(atClose.balancePyg, -70000)
})
test('rechazo o anulación posterior no conserva una deuda ficticia; ajustes son deltas firmados', () => {
  for (const status of ['REJECTED', 'CANCELLED']) {
    const amounts = weeklyAmounts(30000, [{ id: 'p1', amountPyg: 100000, status }], [-5000, 1000])
    assert.equal(amounts.collectedPyg, 0)
    assert.equal(amounts.pendingPyg, 0)
    assert.equal(amounts.adjustmentPyg, -4000)
    assert.equal(amounts.balancePyg, 26000)
  }
  assert.throws(() => reasonInput(''))
  assert.throws(() => reasonInput('ab'))
  assert.equal(reasonInput('  Corrección acordada  '), 'Corrección acordada')
  assert.throws(() => sumPyg([Number.MAX_SAFE_INTEGER, 1]))
})
test('alcance de sucursal nunca se amplía por rol ni por parámetros', () => {
  const actor = { owner: false, user: { role: 'ADMIN', branchId: 'b1' } } as Parameters<typeof branchScope>[0]
  assert.equal(branchScope(actor), 'b1')
  assert.throws(() => branchScope(actor, 'b2'))
  assert.throws(() => branchScope({ ...actor, user: { ...actor.user, branchId: null } }))
  assert.equal(branchScope({ ...actor, owner: true }, 'b2'), 'b2')
})
