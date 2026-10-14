import assert from 'node:assert/strict'
import test from 'node:test'
import { reconcileArrival, type ExpectedLine, type MatchInputRow } from '../lib/arrival-match'

// #408 unidad C · conciliación determinista contra lo pedido.

function row(rowIndex: number, over: Partial<MatchInputRow> = {}): MatchInputRow {
  return {
    rowIndex, productId: 'p1', condition: 'NEW', serial: null, serialKind: 'NINGUNO',
    declaredNoLlego: false, destination: 'STOCK', issues: [], ...over,
  }
}
function line(id: string, over: Partial<ExpectedLine> = {}): ExpectedLine {
  return { id, productId: 'p1', condition: 'NEW', openQuantity: 1, serials: [], createdAt: '2026-10-01T00:00:00Z', ...over }
}
const byIndex = <T extends { rowIndex: number }>(rows: T[], i: number) => rows.find(r => r.rowIndex === i)!

test('serie exacta de la compra → EXACTO con vínculos de compra, necesidad y envío', () => {
  const r = reconcileArrival(
    [row(1, { serial: '352793001122334', serialKind: 'IMEI' })],
    [line('L1', { serials: ['352793001122334'], purchaseId: 'C1', needId: 'N1', shipmentItemId: 'S1' })],
  )
  const m = byIndex(r.rows, 1)
  assert.equal(m.match, 'EXACTO')
  assert.equal(m.purchaseLineId, 'L1')
  assert.equal(m.purchaseId, 'C1')
  assert.equal(m.needId, 'N1')
  assert.equal(m.shipmentItemId, 'S1')
  assert.equal(r.counts.NO_LLEGO, 0)
})

test('la serie exacta ignora mayúsculas y gana al emparejamiento por modelo', () => {
  const r = reconcileArrival(
    [row(1, { serial: 'sltwkf47rwl', serialKind: 'SERIE' })],
    [line('VIEJA', { createdAt: '2026-09-01T00:00:00Z' }), line('NUEVA', { serials: ['SLTWKF47RWL'], createdAt: '2026-10-05T00:00:00Z' })],
  )
  assert.equal(byIndex(r.rows, 1).match, 'EXACTO')
  assert.equal(byIndex(r.rows, 1).purchaseLineId, 'NUEVA')
  assert.equal(r.counts.NO_LLEGO, 1, 'queda la línea vieja sin cubrir')
})

test('producto + condición contra líneas abiertas, de la más vieja a la más nueva', () => {
  const r = reconcileArrival(
    [row(1), row(2), row(3)],
    [line('NUEVA', { createdAt: '2026-10-09T00:00:00Z', openQuantity: 5 }), line('VIEJA', { createdAt: '2026-10-01T00:00:00Z', openQuantity: 2 })],
  )
  assert.deepEqual(r.rows.map(x => [x.rowIndex, x.match, x.purchaseLineId]), [
    [1, 'POR_MODELO', 'VIEJA'], [2, 'POR_MODELO', 'VIEJA'], [3, 'POR_MODELO', 'NUEVA'],
    [4, 'NO_LLEGO', 'NUEVA'], [5, 'NO_LLEGO', 'NUEVA'], [6, 'NO_LLEGO', 'NUEVA'], [7, 'NO_LLEGO', 'NUEVA'],
  ])
  assert.equal(r.counts.POR_MODELO, 3)
  assert.equal(r.counts.NO_LLEGO, 4)
})

test('condición distinta no empareja por modelo: sobrante con aviso y lo pedido queda como no llegó', () => {
  const r = reconcileArrival([row(1, { condition: 'USED' })], [line('L1', { condition: 'NEW' })])
  assert.equal(byIndex(r.rows, 1).match, 'SOBRANTE')
  assert.ok(byIndex(r.rows, 1).issues.some(i => i.code === 'SOBRANTE'))
  assert.equal(r.rows.filter(x => x.match === 'NO_LLEGO').length, 1)
})

test('producto distinto → sobrante con aviso', () => {
  const r = reconcileArrival([row(1, { productId: 'otro' })], [line('L1')])
  assert.equal(byIndex(r.rows, 1).match, 'SOBRANTE')
  assert.equal(byIndex(r.rows, 1).purchaseLineId, null)
  assert.ok(r.warnings.some(w => w.code === 'SOBRANTES'))
  assert.ok(r.warnings.some(w => w.code === 'NO_LLEGARON'))
})

test('sin nada esperado todo es sobrante; lo sin producto no recibe aviso de sobrante', () => {
  const r = reconcileArrival([row(1), row(2, { productId: null })], [])
  assert.deepEqual(r.rows.map(x => x.match), ['SOBRANTE', 'SOBRANTE'])
  assert.ok(byIndex(r.rows, 1).issues.some(i => i.code === 'SOBRANTE'))
  assert.ok(!byIndex(r.rows, 2).issues.some(i => i.code === 'SOBRANTE'))
})

test('lo esperado que no se pegó vuelve como filas NO_LLEGO sintéticas con sus vínculos', () => {
  const r = reconcileArrival([row(1)], [line('L1', { openQuantity: 3, purchaseId: 'C1', needId: 'N1' })])
  const missing = r.rows.filter(x => x.synthetic)
  assert.equal(missing.length, 2)
  assert.deepEqual(missing.map(x => x.rowIndex), [2, 3])
  assert.ok(missing.every(x => x.match === 'NO_LLEGO' && x.purchaseLineId === 'L1' && x.needId === 'N1' && x.productId === 'p1'))
})

test('las series pedidas y no pegadas viajan en la fila NO_LLEGO', () => {
  const r = reconcileArrival<MatchInputRow>([], [line('L1', { openQuantity: 2, serials: ['AAA111', 'BBB222'] })])
  assert.deepEqual(r.rows.map(x => x.serial), ['AAA111', 'BBB222'])
  assert.ok(r.rows.every(x => x.serialKind === 'IMEI'))
})

test('fila declarada «NO LLEGÓ» consume lo esperado y no duplica la fila sintética', () => {
  const r = reconcileArrival([row(1, { declaredNoLlego: true })], [line('L1')])
  assert.equal(r.rows.length, 1)
  assert.equal(r.rows[0].match, 'NO_LLEGO')
  assert.equal(r.rows[0].purchaseLineId, 'L1')
  assert.equal(r.rows[0].synthetic, false)
})

test('«NO LLEGÓ» sin pedido que lo respalde queda marcado con aviso', () => {
  const r = reconcileArrival([row(1, { declaredNoLlego: true })], [])
  assert.equal(r.rows[0].match, 'NO_LLEGO')
  assert.ok(r.rows[0].issues.some(i => i.code === 'NO_LLEGO_SIN_PEDIDO'))
})

test('«NO LLEGÓ» reserva su lugar antes que las filas que sí llegaron del mismo modelo', () => {
  const r = reconcileArrival([row(1), row(2, { declaredNoLlego: true })], [line('L1', { openQuantity: 1 })])
  assert.equal(byIndex(r.rows, 2).match, 'NO_LLEGO')
  assert.equal(byIndex(r.rows, 1).match, 'SOBRANTE')
})

test('una serie pegada no consume dos veces la misma línea', () => {
  const r = reconcileArrival(
    [row(1, { serial: 'AAA111' }), row(2, { serial: 'ZZZ999' })],
    [line('L1', { openQuantity: 1, serials: ['AAA111'] })],
  )
  assert.equal(byIndex(r.rows, 1).match, 'EXACTO')
  assert.equal(byIndex(r.rows, 2).match, 'SOBRANTE')
  assert.equal(r.counts.NO_LLEGO, 0)
})

test('una serie esperada que llega por modelo en otra fila deja la serie original como no llegó', () => {
  const r = reconcileArrival(
    [row(1, { serial: 'ZZZ999' })],
    [line('L1', { openQuantity: 2, serials: ['AAA111', 'BBB222'] })],
  )
  assert.equal(byIndex(r.rows, 1).match, 'POR_MODELO')
  const missing = r.rows.filter(x => x.synthetic)
  assert.equal(missing.length, 1)
  assert.equal(missing[0].serial, 'AAA111')
})

test('serie de otra compra con otro producto → EXACTO con aviso de producto distinto', () => {
  const r = reconcileArrival([row(1, { serial: 'AAA111', productId: 'p9' })], [line('L1', { serials: ['AAA111'] })])
  assert.equal(r.rows[0].match, 'EXACTO')
  assert.ok(r.rows[0].issues.some(i => i.code === 'PRODUCTO_DISTINTO'))
})

test('es determinista y no muta la entrada', () => {
  const rows = [row(2), row(1)]
  const lines = [line('B', { createdAt: '2026-10-02T00:00:00Z' }), line('A', { createdAt: '2026-10-02T00:00:00Z' })]
  const snapshot = JSON.stringify({ rows, lines })
  const a = reconcileArrival(rows, lines)
  const b = reconcileArrival(rows, lines)
  assert.equal(JSON.stringify({ rows, lines }), snapshot)
  assert.deepEqual(a, b)
  assert.deepEqual(a.rows.map(x => x.purchaseLineId), ['A', 'B'], 'empate de fecha: por id')
})

test('conserva los campos extra de la fila (destino, vínculos del pegado)', () => {
  const r = reconcileArrival([{ ...row(1), destination: 'OTRA_SUCURSAL', extra: 'x' }], [line('L1')])
  assert.equal(r.rows[0].destination, 'OTRA_SUCURSAL')
  assert.equal((r.rows[0] as unknown as { extra: string }).extra, 'x')
})

test('contadores del lote de la planilla: 2 exactos, 1 por modelo, 1 sobrante, 1 no llegó', () => {
  const r = reconcileArrival(
    [
      row(1, { serial: 'IMEI1' }), row(2, { serial: 'IMEI2' }), row(3, { productId: 'p2' }), row(4, { productId: 'p3' }),
    ],
    [
      line('L1', { serials: ['IMEI1', 'IMEI2'], openQuantity: 2 }),
      line('L2', { productId: 'p2' }),
      line('L3', { productId: 'p4' }),
    ],
  )
  assert.deepEqual(r.counts, { EXACTO: 2, POR_MODELO: 1, SOBRANTE: 1, NO_LLEGO: 1 })
})
