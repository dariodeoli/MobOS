import assert from 'node:assert/strict'
import { distributePurchaseCosts, purchaseTotals } from '../lib/purchases.js'

const lines = [
  { id: 'phone', productId: 'p1', quantity: 1, unitCostPyg: 1_000_000, lotReference: 'CDE-001' },
  { id: 'accessory', productId: 'p2', quantity: 4, unitCostPyg: 100_000, lotReference: 'CDE-002' },
]
const result = distributePurchaseCosts(lines, { shippingPyg: 70_001, customsPyg: 20_000, insurancePyg: 10_000, taxesPyg: 5_000, otherCostsPyg: 3_000 })

assert.equal(result.reduce((sum, line) => sum + line.allocatedShippingPyg, 0), 70_001, 'no se pierden guaraníes por redondeo')
assert.equal(result.reduce((sum, line) => sum + line.finalTotalCostPyg, 0), 1_508_001)
assert.equal(result[0].lotReference, 'CDE-001')
assert.ok(result[0].allocatedShippingPyg > result[1].allocatedShippingPyg, 'por valor el equipo absorbe mayor proporción')

const byQuantity = distributePurchaseCosts(lines, { shippingPyg: 500, customsPyg: 0, insurancePyg: 0, taxesPyg: 0, otherCostsPyg: 0, method: 'PROPORTIONAL_QUANTITY' })
assert.equal(byQuantity[0].allocatedShippingPyg, 100)
assert.equal(byQuantity[1].allocatedShippingPyg, 400)
assert.deepEqual(purchaseTotals(result, [{ amountPyg: 500_000 }, { amountPyg: 100_000 }]), { finalCostPyg: 1_508_001, paidPyg: 600_000, outstandingPyg: 908_001 })
console.log('purchases-costing: 8 checks OK')
