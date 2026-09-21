import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveInsuranceRate } from '../lib/insurance'

test('el seguro del producto manda sobre el del cliente y la categoría', () => {
  assert.equal(resolveInsuranceRate({ productRate: 3, customerEnabled: true, customerRate: 25, categoryRate: 10 }), 3)
  assert.equal(resolveInsuranceRate({ productRate: 12.5 }), 12.5)
})

test('con el seguro del cliente activo gana su porcentaje personalizado', () => {
  assert.equal(resolveInsuranceRate({ customerEnabled: true, customerRate: 25, categoryRate: 10 }), 25)
  assert.equal(resolveInsuranceRate({ customerEnabled: true, customerRate: '7.5', categoryRate: 10 }), 7.5)
})

test('con el seguro del cliente activo sin porcentaje propio cae al default de la empresa', () => {
  // FIN #162 conecta el default de la empresa; hasta entonces vale 0.
  assert.equal(resolveInsuranceRate({ customerEnabled: true, customerRate: null, companyDefaultPct: 5, categoryRate: 10 }), 5)
  assert.equal(resolveInsuranceRate({ customerEnabled: true, customerRate: null, companyDefaultPct: 0 }), 0)
})

test('sin seguro del cliente rige la política por categoría', () => {
  assert.equal(resolveInsuranceRate({ customerEnabled: false, customerRate: 25, categoryRate: 10 }), 10)
  assert.equal(resolveInsuranceRate({ customerEnabled: false, categoryRate: null }), 0)
  assert.equal(resolveInsuranceRate({}), 0)
})

test('valores inválidos o negativos no generan seguro', () => {
  assert.equal(resolveInsuranceRate({ productRate: 0, customerEnabled: true, customerRate: 25 }), 0)
  assert.equal(resolveInsuranceRate({ productRate: -5, customerEnabled: true, customerRate: -1, companyDefaultPct: -3 }), 0)
  assert.equal(resolveInsuranceRate({ customerEnabled: true, customerRate: 'no-numero', companyDefaultPct: null }), 0)
})
