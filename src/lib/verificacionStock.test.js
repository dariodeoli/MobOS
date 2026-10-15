import assert from 'node:assert/strict'
import test from 'node:test'
import { clasificarEscaneo, msParaDeshacer, puedeDeshacerVerificacion, resumirVerificacion, VENTANA_DESHACER_MS } from './verificacionStock.js'

const alcance = { branchId: 'b1', locationId: null }
const unidad = (extra = {}) => ({ status: 'AVAILABLE', branchId: 'b1', locationId: 'd1', ...extra })

test('clasifica lecturas: verificada o inesperada con motivo', () => {
  assert.deepEqual(clasificarEscaneo(unidad(), alcance), { outcome: 'VERIFIED' })
  assert.deepEqual(clasificarEscaneo(null, alcance), { outcome: 'UNEXPECTED', reason: 'UNKNOWN' })
  assert.equal(clasificarEscaneo(unidad({ status: 'SOLD' }), alcance).reason, 'SOLD')
  assert.equal(clasificarEscaneo(unidad({ branchId: 'b2' }), alcance).reason, 'OTHER_BRANCH')
  assert.equal(clasificarEscaneo(unidad({ locationId: 'd2' }), { branchId: 'b1', locationId: 'd1' }).reason, 'OTHER_LOCATION')
})

test('32 de 40: pendientes ordenadas, inesperadas aparte y porcentaje', () => {
  const esperadas = Array.from({ length: 40 }, (_, i) => `S${String(i).padStart(2, '0')}`)
  const escaneos = [...esperadas.slice(0, 32).map((serial) => ({ serial, outcome: 'VERIFIED' })), { serial: 'X', outcome: 'UNEXPECTED' }]
  const r = resumirVerificacion(esperadas, escaneos)
  assert.deepEqual([r.expected, r.verified, r.missing, r.unexpected, r.percent], [40, 32, 8, 1, 80])
  assert.equal(r.pending[0], 'S32')
})

test('el check de la fila se deshace solo si es tuyo y dentro del minuto', () => {
  const ahora = Date.parse('2026-10-15T10:00:30.000Z')
  const item = { kind: 'unit', lastVerifiedAt: '2026-10-15T10:00:00.000Z', verifiedById: 'u1' }
  assert.equal(puedeDeshacerVerificacion(item, 'u1', ahora), true)
  assert.equal(puedeDeshacerVerificacion(item, 'u2', ahora), false)
  assert.equal(puedeDeshacerVerificacion(item, 'u1', ahora + VENTANA_DESHACER_MS), false)
  assert.equal(msParaDeshacer(item.lastVerifiedAt, ahora), 30_000)
})
