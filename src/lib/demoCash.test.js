import assert from 'node:assert/strict'
import test from 'node:test'

const store = new Map()
globalThis.localStorage = { getItem: (key) => store.get(key) || null, setItem: (key, value) => store.set(key, value) }
const { closeDemoCash, getDemoCash, openDemoCash } = await import('./demoCash.js')

test('demo cash is versioned locally and closes with a numeric difference', () => {
  const opened = openDemoCash(500000, 'turno demo')
  assert.equal(opened.status, 'OPEN')
  assert.equal(getDemoCash().openingPyg, 500000)
  const closed = closeDemoCash(1200000, 1180000)
  assert.equal(closed.status, 'CLOSED')
  assert.equal(closed.differencePyg, 20000)
  assert.equal(getDemoCash().closedById, 'demo-user')
})
