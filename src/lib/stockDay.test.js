import test from 'node:test'
import assert from 'node:assert/strict'
import { nextStockDayDelay, stockBusinessDay } from './stockDay.js'
test('Stock cambia el día al llegar medianoche de Paraguay, no de UTC (#466)', () => {
  const beforeUTC = new Date('2026-10-15T23:59:59Z')
  const afterUTC = new Date('2026-10-16T00:00:01Z')
  assert.equal(stockBusinessDay(beforeUTC), stockBusinessDay(afterUTC))
  const midnight = new Date('2026-10-16T03:00:00Z')
  assert.notEqual(stockBusinessDay(new Date(midnight.getTime() - 1)), stockBusinessDay(midnight))
  const delay = nextStockDayDelay(afterUTC)
  assert.ok(Math.abs(delay - (midnight.getTime() - afterUTC.getTime())) < 2100)
})
