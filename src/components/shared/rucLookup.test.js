import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { admitRucResponse, createRucRequestGuard, formatRucInput, lookupDemoRuc, parseRucInput } from './rucLookup.js'

function responseFor(identity, nameOfficial = '  PÉREZ   LÓPEZ, JUAN S.A.  ') {
  return {
    query: { normalized: identity.query, fullRuc: identity.fullRuc },
    reviewRequired: true,
    source: { provider: 'OwnData' },
    result: { ruc: identity.base, dv: identity.dv, fullRuc: identity.fullRuc,
      nameOfficial, name: 'Do not use this transformed alias', stateRaw: 'ACTIVO', equivalenceRaw: '' },
  }
}

const scopeFor = (query) => ({ query, demo: false, disabled: false, lookupDisabled: false, visible: true })

test('the ninth unhyphenated digit belongs to the base', () => {
  assert.equal(formatRucInput('123456789'), '123456789')
  const identity = parseRucInput('123456789')
  assert.equal(identity.base, '123456789')
  assert.equal(identity.query, '123456789')
  assert.equal(identity.fullRuc, '123456789-0')
  assert.equal(parseRucInput('1234567890'), null)
  assert.equal(parseRucInput('012345678'), null)
})

test('explicit single DV must match modulo 11, including short bases', () => {
  assert.equal(parseRucInput('123456789-0').query, '123456789-0')
  assert.equal(parseRucInput('1-9').query, '1-9')
  for (const invalid of ['123456789-1', '123456789-', '123456789-07', '1--9', '']) {
    assert.equal(parseRucInput(invalid), null, invalid)
  }
})

test('common formatting is removed without guessing or truncating a DV', () => {
  assert.equal(formatRucInput('123.456.789 - 0'), '123456789-0')
  assert.equal(parseRucInput('123.456.789 - 0').query, '123456789-0')
  assert.equal(formatRucInput('123456789-07'), '123456789-07')
  assert.equal(parseRucInput('123x456'), null)
})

test('admission preserves the exact raw fiscal name and compatibility alias', () => {
  const identity = parseRucInput('123456789')
  const payload = responseFor(identity)
  const result = admitRucResponse(payload, identity)
  assert.equal(result.nameOfficial, payload.result.nameOfficial)
  assert.equal(result.name, payload.result.nameOfficial)
  assert.equal(result.stateRaw, 'ACTIVO')
})

test('wrong identity, missing review contract, or simulated real response is not admitted', () => {
  const identity = parseRucInput('123456789')
  for (const mutate of [
    (p) => { p.query.normalized = '12345678' },
    (p) => { p.result.fullRuc = '123456789-1' },
    (p) => { p.result.ruc = '12345678' },
    (p) => { p.result.dv = '1' },
    (p) => { p.result.nameOfficial = '   ' },
    (p) => { delete p.result.nameOfficial },
    (p) => { p.result.stateRaw = null },
    (p) => { p.reviewRequired = false },
    (p) => { p.source.provider = 'Other' },
    (p) => { p.result.simulado = true },
  ]) {
    const payload = responseFor(identity)
    mutate(payload)
    assert.equal(admitRucResponse(payload, identity), null)
  }
  assert.equal(admitRucResponse(null, identity), null)
})

test('late mock results cannot survive cancellation or an A → B → A sequence', async () => {
  const guard = createRucRequestGuard()
  const scope = scopeFor('123456789')
  const request = guard.begin(scope)
  let resolve
  const pending = new Promise((done) => { resolve = done })
  const admitted = pending.then(() => request.isCurrent(scope))
  guard.cancel()
  const next = guard.begin(scopeFor('1'))
  assert.equal(request.signal.aborted, true)
  assert.equal(next.isCurrent(scope), false)
  resolve()
  assert.equal(await admitted, false)
  assert.equal(request.isCurrent(scope), false)
  guard.cancel()
})

test('scope identity guards even before cancellation, including demo and disabled changes', () => {
  const scope = scopeFor('123456789')
  const guard = createRucRequestGuard()
  const request = guard.begin(scope)
  assert.equal(request.isCurrent({ ...scope }), true)
  for (const changed of [{ query: '1' }, { demo: true }, { disabled: true }, { lookupDisabled: true }, { visible: false }]) {
    assert.equal(request.isCurrent({ ...scope, ...changed }), false)
  }
  guard.cancel()
  assert.equal(request.isCurrent(scope), false)
})

test('simulation accepts short and nine-digit bases using only an injected mock', async () => {
  const calls = []
  const mockLookup = async (query) => {
    calls.push(query)
    return { name: 'EMPRESA FICTICIA S.A.', fullRuc: 'mock only', simulado: true }
  }
  for (const query of ['1', '123456789', '123456789-0']) {
    const identity = parseRucInput(query)
    const result = await lookupDemoRuc(identity, mockLookup)
    assert.equal(result.fullRuc, identity.fullRuc)
    assert.equal(result.nameOfficial, 'EMPRESA FICTICIA S.A.')
    assert.equal(result.simulado, true)
  }
  assert.deepEqual(calls, ['00001', '123456789', '123456789'])
  assert.equal(await lookupDemoRuc(parseRucInput('1'), async () => ({ name: 'Unmarked mock' })), null)
})

test('component source keeps uncached internal transport and acceptance-only callbacks', () => {
  const source = readFileSync(new URL('./RucField.jsx', import.meta.url), 'utf8')
  assert.match(source, /api\.get\(`\/api\/ruc/)
  assert.match(source, /signal: request\.signal, cacheMs: 0, cache: 'no-store'/)
  const extract = source.slice(source.indexOf('async function extract()'), source.indexOf('function apply()'))
  assert.doesNotMatch(extract, /onAplicar|onDatos|accept\?\./)
  assert.match(source, /const accept = onAplicar \|\| onDatos/)
  assert.match(source, /onClick=\{apply\}/)
  assert.match(source, /onClick=\{invalidate\}>Descartar/)
})
