import assert from 'node:assert/strict'
import test from 'node:test'

// #194: ajustes ficticios del tenant demo, guardados solo en el navegador.
const store = new Map()
globalThis.localStorage = { getItem: (key) => store.get(key) || null, setItem: (key, value) => store.set(key, value) }
const { getDemoTenant, getDemoInsurancePct, setDemoInsurancePct, setDemoLimits, setDemoNumeracion } = await import('./demoTenant.js')

test('el tenant demo arranca con valores ficticios por defecto', () => {
  const tenant = getDemoTenant()
  assert.equal(tenant.insurancePct, 0)
  assert.equal(tenant.expenseLimitPyg, 1000000)
  assert.equal(tenant.purchaseCreditLimitPyg, 5000000)
  assert.equal(tenant.belowListPct, 10)
  assert.equal(tenant.loyaltyPct, 0)
  assert.equal(tenant.orderPrefix, 'AUR')
  assert.equal(getDemoInsurancePct(), 0)
})

test('el seguro demo se guarda, se acota y se apaga', () => {
  assert.equal(setDemoInsurancePct(25), 25)
  assert.equal(getDemoInsurancePct(), 25)
  assert.equal(setDemoInsurancePct(150), 100)
  assert.equal(setDemoInsurancePct(-5), 0)
  assert.equal(setDemoInsurancePct(null), 0)
  assert.equal(getDemoInsurancePct(), 0)
  assert.equal(setDemoInsurancePct('30'), 30)
})

test('límites y numeración demo persisten en el navegador', () => {
  const guardado = setDemoLimits({ expenseLimitPyg: 2000000, belowListPct: 5 })
  assert.equal(guardado.expenseLimitPyg, 2000000)
  assert.equal(guardado.belowListPct, 5)
  assert.equal(getDemoTenant().purchaseCreditLimitPyg, 5000000, 'el resto conserva el default')
  const numeracion = setDemoNumeracion({ prefix: 'TST', start: 42 })
  assert.equal(numeracion.orderPrefix, 'TST')
  assert.equal(numeracion.orderNextNumber, 42)
  assert.equal(getDemoTenant().orderPrefix, 'TST')
})
