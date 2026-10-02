import assert from 'node:assert/strict'
import test from 'node:test'
import { ETIQUETA_SEVERIDAD, etiquetaCampo, severidadAuditoria } from './auditoriaLectura.js'

test('#301 · la severidad separa lo destructivo de lo informativo', () => {
  for (const action of ['INVENTORY_UNIT_REMOVED', 'PAYMENT_VOIDED', 'CUSTOMER_MERGED_INTO', 'PRINT_JOB_FAILED', 'SESSION_REVOKED', 'QUOTE_REJECTED']) {
    assert.equal(severidadAuditoria(action), 'alta', `${action} es sensible`)
  }
  for (const action of ['CUSTOMER_UPDATED', 'PAYMENT_CONFIRMED', 'INVENTORY_COUNT_APPLIED', 'PRINT_JOB_ENQUEUED', 'STOCK_TRANSFERRED']) {
    assert.equal(severidadAuditoria(action), 'media', `${action} es un cambio`)
  }
  for (const action of ['SESSION_OPENED', 'COMPANY_SIGNED_IN', 'REPORT_VIEWED']) {
    assert.equal(severidadAuditoria(action), 'info', `${action} es actividad`)
  }
  assert.equal(severidadAuditoria(''), 'info')
  assert.equal(severidadAuditoria(null), 'info')
  assert.deepEqual(Object.keys(ETIQUETA_SEVERIDAD).sort(), ['alta', 'info', 'media'])
})

test('#301 · los campos técnicos tienen etiqueta legible', () => {
  assert.equal(etiquetaCampo('serial'), 'IMEI')
  assert.equal(etiquetaCampo('requestId'), 'ID de petición')
  assert.equal(etiquetaCampo('url'), 'URL')
  assert.equal(etiquetaCampo('campo_raro'), 'campo_raro')
})
