import assert from 'node:assert/strict'
import test from 'node:test'
import { FX_TTL_MS, FxUnavailableError, __setFxProvidersForTest, fxSettingsFrom, getFxQuote, pickRate, validateFxSettings } from '../lib/fx'
import { melizecheTimestamp, parseMelizeche } from '../lib/fx/melizeche'
import { rateOriginSnapshot } from '../lib/payment-input'
import type { FxProvider, FxQuote } from '../lib/fx'

// Cotización por fuente (#401): parseo, ajustes por empresa, caché y último valor conocido.

const PAYLOAD = {
  dolarpy: {
    bcp: { compra: 5693.57, referencial_diario: 5698.03, venta: 5712.67 },
    cambioschaco: { compra: 5610, venta: 5710 },
    maxicambios: { compra: 0, venta: 0 },
    familiar: { compra: 5590 },
  },
  updated: '2026-10-14 16:50:28',
}

test('parseMelizeche: Cambios Chaco y BCP normalizados; casas en cero o incompletas se omiten', () => {
  const quotes = parseMelizeche(PAYLOAD)
  const chaco = quotes.find(q => q.source === 'cambioschaco')
  assert.deepEqual(chaco, { source: 'cambioschaco', currency: 'USD', compra: 5610, venta: 5710, updatedAt: '2026-10-14T19:50:28.000Z', referencial: null })
  assert.equal(quotes.find(q => q.source === 'bcp')?.referencial, 5698.03)
  assert.equal(quotes.some(q => q.source === 'maxicambios'), false)
  assert.equal(quotes.some(q => q.source === 'familiar'), false)
})

test('parseMelizeche: payload ausente, malformado o sin moneda devuelve vacío', () => {
  for (const bad of [null, undefined, 'x', 42, [], {}, { dolarpy: null }, { dolarpy: [] }, { dolarpy: { cambioschaco: 'x' } }, { dolarpy: { cambioschaco: { compra: 'abc', venta: -1 } } }]) {
    assert.deepEqual(parseMelizeche(bad), [], JSON.stringify(bad))
  }
  assert.equal(parseMelizeche({ dolarpy: { cambioschaco: { compra: 5600, venta: 5700 } } })[0].updatedAt, null)
})

test('melizecheTimestamp: hora de Asunción a ISO; formatos raros dan null', () => {
  assert.equal(melizecheTimestamp('2026-10-14 16:50:28'), '2026-10-14T19:50:28.000Z')
  assert.equal(melizecheTimestamp('2026-10-14 16:50'), '2026-10-14T19:50:00.000Z')
  for (const bad of ['ayer', '', null, 5, '2026-13-45 99:99:99']) assert.equal(melizecheTimestamp(bad), null)
})

test('fxSettingsFrom: por defecto Cambios Chaco · compra para cobros y · venta para costos; valores inválidos vuelven al defecto', () => {
  const sales = { source: 'cambioschaco', side: 'compra' }
  const costs = { source: 'cambioschaco', side: 'venta' }
  for (const settings of [undefined, null, {}, [], 'x', { fx: null }, { fx: { sales: { source: 'inventada', side: 'otro' } } }]) {
    assert.deepEqual(fxSettingsFrom(settings), { sales, costs }, JSON.stringify(settings))
  }
  assert.deepEqual(fxSettingsFrom({ fx: { sales: { source: 'bcp', side: 'compra' }, costs: { source: 'familiar', side: 'venta' } } }), { sales: { source: 'bcp', side: 'compra' }, costs: { source: 'familiar', side: 'venta' } })
})

test('validateFxSettings: acepta fuentes conocidas y rechaza el resto con mensaje', () => {
  const ok = validateFxSettings({ sales: { source: 'bcp', side: 'compra' }, costs: { source: 'cambioschaco', side: 'venta' } })
  assert.equal(ok.ok, true)
  for (const bad of [null, [], {}, { sales: { source: 'bcp', side: 'compra' } }, { sales: { source: 'nada', side: 'compra' }, costs: { source: 'bcp', side: 'venta' } }, { sales: { source: 'bcp', side: 'medio' }, costs: { source: 'bcp', side: 'venta' } }]) {
    const out = validateFxSettings(bad)
    assert.equal(out.ok, false, JSON.stringify(bad))
    assert.ok(!out.ok && out.error.length > 0)
  }
})

function provider(quotes: () => FxQuote[] | Error, calls = { n: 0 }): FxProvider {
  return { id: 'test', async fetchAll() { calls.n += 1; const out = quotes(); if (out instanceof Error) throw out; return out } }
}
const quote = (venta: number, source = 'cambioschaco'): FxQuote => ({ source, currency: 'USD', compra: venta - 100, venta, updatedAt: '2026-10-14T19:50:28.000Z' })

test('getFxQuote: caché por fuente de 10 min, un solo pedido al proveedor, lado compra/venta', async () => {
  const calls = { n: 0 }
  __setFxProvidersForTest([provider(() => [quote(5710), quote(5800, 'familiar')], calls)])
  const t0 = 1_000_000
  const first = await getFxQuote('cambioschaco', 'USD', t0)
  assert.equal(first.cached, false); assert.equal(first.stale, false)
  assert.equal(pickRate(first.quote, 'venta'), 5710)
  assert.equal(pickRate(first.quote, 'compra'), 5610)
  const other = await getFxQuote('familiar', 'USD', t0 + 1000)
  assert.equal(other.quote.venta, 5800); assert.equal(other.cached, true)
  assert.equal(calls.n, 1)
  await getFxQuote('cambioschaco', 'USD', t0 + FX_TTL_MS + 1)
  assert.equal(calls.n, 2)
})

test('getFxQuote: si el proveedor cae sirve el último valor conocido como desactualizado', async () => {
  let fail = false
  __setFxProvidersForTest([provider(() => (fail ? new Error('caído') : [quote(5710)]))])
  const t0 = 2_000_000
  await getFxQuote('cambioschaco', 'USD', t0)
  fail = true
  const stale = await getFxQuote('cambioschaco', 'USD', t0 + FX_TTL_MS + 5)
  assert.equal(stale.stale, true); assert.equal(stale.quote.venta, 5710)
  assert.equal(stale.fetchedAt, new Date(t0).toISOString())
})

test('getFxQuote: sin caché y proveedor caído → fx_unavailable; moneda ausente → fx_currency_unavailable', async () => {
  __setFxProvidersForTest([provider(() => new Error('caído'))])
  await assert.rejects(getFxQuote('cambioschaco', 'USD', 3_000_000), (e: unknown) => e instanceof FxUnavailableError && e.code === 'fx_unavailable')
  __setFxProvidersForTest([provider(() => [quote(5710)])])
  await assert.rejects(getFxQuote('cambioschaco', 'BRL', 4_000_000), (e: unknown) => e instanceof FxUnavailableError && e.code === 'fx_currency_unavailable')
  await assert.rejects(getFxQuote('bcp', 'USD', 4_000_001), (e: unknown) => e instanceof FxUnavailableError && e.code === 'fx_currency_unavailable')
})

test('getFxQuote: tras una caída no reintenta el proveedor durante 30 s', async () => {
  const calls = { n: 0 }
  __setFxProvidersForTest([provider(() => new Error('caído'), calls)])
  await assert.rejects(getFxQuote('cambioschaco', 'USD', 5_000_000))
  await assert.rejects(getFxQuote('cambioschaco', 'USD', 5_010_000))
  assert.equal(calls.n, 1)
  await assert.rejects(getFxQuote('cambioschaco', 'USD', 5_031_000))
  assert.equal(calls.n, 2)
})

test('rateOriginSnapshot: marca manual o automática; basura se ignora', () => {
  assert.deepEqual(rateOriginSnapshot({ manual: true, at: '2026-10-14T19:50:00Z' }), { rateOrigin: { manual: true, at: '2026-10-14T19:50:00.000Z' } })
  assert.deepEqual(rateOriginSnapshot({ manual: false, source: 'cambioschaco', side: 'venta' }), { rateOrigin: { manual: false, source: 'cambioschaco', side: 'venta', at: null } })
  for (const bad of [undefined, null, 'x', [], {}, { source: 'x; drop', side: 'venta' }, { source: 'bcp', side: 'otro' }]) assert.deepEqual(rateOriginSnapshot(bad), {}, JSON.stringify(bad))
})
