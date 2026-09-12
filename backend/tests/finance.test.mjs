import assert from 'node:assert/strict'
import { frozenAmountPyg, realMargin, balanceDirection, FinanceInputError } from '../lib/finance.ts'

assert.equal(frozenAmountPyg('10.50', 'USD', '7500'), 78750)
assert.equal(frozenAmountPyg('1', 'PYG', '1'), 1)
assert.throws(() => frozenAmountPyg('1', 'PYG', '2'), FinanceInputError)
assert.equal(balanceDirection('IN', 25), 25)
assert.equal(balanceDirection('OUT', 25), -25)
assert.deepEqual(realMargin([{ quantity: 1, totalPyg: 10200000, unitCostPyg: 10000000, insurancePyg: 200000 }]), { revenuePyg: 10200000, costPyg: 10000000, profitPyg: 200000, marginPct: 1.96, unknownCostLines: 0 })
assert.equal(realMargin([{ quantity: 1, totalPyg: 1000, unitCostPyg: null }]).unknownCostLines, 1)
console.log('finance: cotización congelada, saldos y margen real: 7 comprobaciones OK')
