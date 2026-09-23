import assert from 'node:assert/strict'
import { frozenAmountPyg, realMargin, balanceDirection, purchasePayable, FinanceInputError } from '../lib/finance.ts'

assert.equal(frozenAmountPyg('10.50', 'USD', '7500'), 78750)
assert.equal(frozenAmountPyg('1', 'PYG', '1'), 1)
assert.throws(() => frozenAmountPyg('1', 'PYG', '2'), FinanceInputError)
assert.equal(balanceDirection('IN', 25), 25)
assert.equal(balanceDirection('OUT', 25), -25)
assert.deepEqual(realMargin([{ quantity: 1, totalPyg: 10200000, unitCostPyg: 10000000, insurancePyg: 200000 }]), { revenuePyg: 10200000, costPyg: 10000000, profitPyg: 200000, marginPct: 1.96, unknownCostLines: 0 })
assert.equal(realMargin([{ quantity: 1, totalPyg: 1000, unitCostPyg: null }]).unknownCostLines, 1)
// El descuento del carrito baja la venta y la ganancia reconocidas.
assert.deepEqual(realMargin([{ quantity: 1, totalPyg: 100000, unitCostPyg: 60000 }], { discountPyg: 10000 }), { revenuePyg: 90000, costPyg: 60000, profitPyg: 30000, marginPct: 33.33, unknownCostLines: 0 })
assert.deepEqual(purchasePayable({ id: 'p1', supplierName: 'S', lines: [{ quantity: 2, unitCostPyg: 50000, finalTotalCostPyg: 102938 }, { quantity: 3, unitCostPyg: 20000, finalTotalCostPyg: 61762 }], payments: [{ amountPyg: 40000 }] }), { id: 'p1', supplierName: 'S', totalPyg: 164700, paidPyg: 40000, pendingPyg: 124700 })
console.log('finance: cotización congelada, saldos, margen real con descuento y payables prorrateados: 9 comprobaciones OK')
