import test from 'node:test'
import assert from 'node:assert/strict'
import { consultarRucDemoReal } from './rucDemoRequest.js'

const apiUrl = 'https://api.example.test/'
test('demo real consulta únicamente la ruta pública RUC sin sesión, caché ni redirects', async () => {
  const expected = { result: { nameOfficial: 'RAZÓN SOCIAL REAL' }, source: { provider: 'OwnData' } }
  let calls = 0
  const result = await consultarRucDemoReal('80012345-0', { apiUrl, fetchImpl: async (url, init) => {
    calls++
    assert.equal(url, 'https://api.example.test/api/public/ruc?ruc=80012345-0')
    assert.equal(init.method, 'GET')
    assert.equal(init.credentials, 'omit')
    assert.equal(init.cache, 'no-store')
    assert.equal(init.redirect, 'error')
    assert.deepEqual(init.headers, { Accept: 'application/json' })
    assert.equal(init.body, undefined)
    return Response.json(expected)
  } })
  assert.deepEqual(result, expected)
  assert.equal(calls, 1)
})

test('demo real rechaza input o configuración inválidos antes de consultar', async () => {
  const fetchImpl = async () => { assert.fail('no debe consultar') }
  await assert.rejects(consultarRucDemoReal('../customers', { apiUrl, fetchImpl }), { code: 'invalid_ruc' })
  await assert.rejects(consultarRucDemoReal('80012345', { fetchImpl }), { code: 'API_NOT_CONFIGURED' })
})

test('demo real conserva error y espera de cuota sin fabricar un resultado', async () => {
  await assert.rejects(consultarRucDemoReal('80012345', { apiUrl, fetchImpl: async () => Response.json({ message: 'Cuota agotada.', details: { code: 'demo_rate_limited' } }, { status: 429, headers: { 'Retry-After': '17' } }) }), error => {
    assert.equal(error.code, 'demo_rate_limited')
    assert.equal(error.status, 429)
    assert.match(error.message, /17 s/)
    return true
  })
  await assert.rejects(consultarRucDemoReal('80012345', { apiUrl, fetchImpl: async () => Response.json({ message: 'RUC no encontrado.', code: 'not_found' }, { status: 404 }) }), { code: 'not_found', status: 404 })
})

test('demo real falla honestamente ante red y JSON inválido', async () => {
  for (const fetchImpl of [async () => { throw new Error('red') }, async () => new Response('no es JSON')]) {
    await assert.rejects(consultarRucDemoReal('80012345', { apiUrl, fetchImpl }), { code: 'RUC_UNAVAILABLE' })
  }
})

test('demo real propaga cancelación y timeout al transporte', async () => {
  const pendingFetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
    if (signal.aborted) reject(new Error('aborted'))
    else signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  })
  const controller = new AbortController()
  const cancelled = consultarRucDemoReal('80012345', { apiUrl, signal: controller.signal, fetchImpl: pendingFetch })
  controller.abort()
  await assert.rejects(cancelled, { code: 'REQUEST_ABORTED' })
  await assert.rejects(consultarRucDemoReal('80012345', { apiUrl, fetchImpl: pendingFetch, timeoutMs: 1 }), { code: 'REQUEST_TIMEOUT' })
})
