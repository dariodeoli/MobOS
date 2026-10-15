import assert from 'node:assert/strict'
import test from 'node:test'
import { canUndoVerification, classifyScan, summarizeVerification, UNDO_WINDOW_MS } from '../lib/stock-verification'

const scope = { branchId: 'b1', locationId: null }
const unit = (extra = {}) => ({ status: 'AVAILABLE', branchId: 'b1', locationId: 'd1', ...extra })

test('classifyScan: disponible en la sucursal se verifica; el resto es inesperado con motivo', () => {
  assert.deepEqual(classifyScan(unit(), scope), { outcome: 'VERIFIED' })
  assert.deepEqual(classifyScan(unit({ status: 'RESERVED' }), scope), { outcome: 'VERIFIED' })
  assert.deepEqual(classifyScan(null, scope), { outcome: 'UNEXPECTED', reason: 'UNKNOWN' })
  assert.deepEqual(classifyScan(unit({ status: 'SOLD' }), scope), { outcome: 'UNEXPECTED', reason: 'SOLD' })
  assert.deepEqual(classifyScan(unit({ status: 'IN_TRANSIT' }), scope), { outcome: 'UNEXPECTED', reason: 'IN_TRANSIT' })
  assert.deepEqual(classifyScan(unit({ branchId: 'b2' }), scope), { outcome: 'UNEXPECTED', reason: 'OTHER_BRANCH' })
  assert.deepEqual(classifyScan(unit({ removedAt: new Date() }), scope), { outcome: 'UNEXPECTED', reason: 'REMOVED' })
})

test('classifyScan: con depósito elegido, otro depósito es inesperado', () => {
  const deposito = { branchId: 'b1', locationId: 'd1' }
  assert.deepEqual(classifyScan(unit(), deposito), { outcome: 'VERIFIED' })
  assert.deepEqual(classifyScan(unit({ locationId: 'd2' }), deposito), { outcome: 'UNEXPECTED', reason: 'OTHER_LOCATION' })
})

test('summarizeVerification: 32/40, pendientes ordenadas e inesperadas aparte', () => {
  const esperadas = Array.from({ length: 40 }, (_, i) => `S${String(i).padStart(2, '0')}`)
  const scans = [...esperadas.slice(0, 32).map(serial => ({ serial, outcome: 'VERIFIED' })), { serial: 'X1', outcome: 'UNEXPECTED' }, { serial: 'X1', outcome: 'UNEXPECTED' }]
  const resumen = summarizeVerification(esperadas, scans)
  assert.equal(resumen.expected, 40); assert.equal(resumen.verified, 32); assert.equal(resumen.missing, 8)
  assert.equal(resumen.unexpected, 1); assert.equal(resumen.percent, 80); assert.equal(resumen.pending[0], 'S32')
})

test('summarizeVerification: sin esperadas es 100% y un escaneo repetido no duplica', () => {
  assert.equal(summarizeVerification([], []).percent, 100)
  const r = summarizeVerification(['A'], [{ serial: 'A', outcome: 'VERIFIED' }, { serial: 'A', outcome: 'VERIFIED' }])
  assert.equal(r.verified, 1); assert.equal(r.missing, 0)
})

test('canUndoVerification: solo quien verificó, dentro del minuto y sin verificación posterior', () => {
  const at = new Date('2026-10-15T10:00:00.000Z')
  const base = { verifiedAt: at, verifiedById: 'u1', userId: 'u1', auditAt: at }
  assert.equal(canUndoVerification({ ...base, now: new Date(at.getTime() + 30_000) }), true)
  assert.equal(canUndoVerification({ ...base, now: new Date(at.getTime() + UNDO_WINDOW_MS + 1) }), false)
  assert.equal(canUndoVerification({ ...base, userId: 'u2', now: at }), false)
  assert.equal(canUndoVerification({ ...base, auditAt: new Date(at.getTime() - 5000), now: at }), false)
  assert.equal(canUndoVerification({ ...base, verifiedAt: null, now: at }), false)
})
