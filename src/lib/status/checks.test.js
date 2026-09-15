import assert from 'node:assert/strict'
import test from 'node:test'
import { checkMobosStatus } from './checks.js'

test('status derives transactional email readiness from health without invoking recovery', async () => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  const urls = []
  globalThis.window = { setTimeout, clearTimeout }
  globalThis.fetch = async url => {
    urls.push(String(url))
    if (String(url).includes('/api/health')) return Response.json({ ok: true, services: { api: 'operational', database: 'operational', email: 'configured' } })
    if (String(url).includes('/api/auth/google')) return Response.json({ configured: true })
    if (String(url).includes('/api/inventory-reservations')) return new Response(null, { status: 401 })
    return new Response(null, { status: 200 })
  }
  try {
    const result = await checkMobosStatus()
    assert.equal(result.services.email.state, 'configured')
    assert.equal(urls.some(url => url.includes('/api/auth/password-recovery')), false)
    assert.equal(urls.filter(url => url.includes('/api/health')).length, 1)
  } finally {
    globalThis.fetch = originalFetch
    globalThis.window = originalWindow
  }
})

test('email remains configured when health is 503 because another service is unavailable', async () => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  globalThis.window = { setTimeout, clearTimeout }
  globalThis.fetch = async url => {
    if (String(url).includes('/api/health')) return Response.json({ ok: false, services: { api: 'operational', database: 'unavailable', email: 'configured' } }, { status: 503 })
    if (String(url).includes('/api/auth/google')) return Response.json({ configured: true })
    if (String(url).includes('/api/inventory-reservations')) return new Response(null, { status: 401 })
    return new Response(null, { status: 200 })
  }
  try {
    const result = await checkMobosStatus()
    assert.equal(result.services.api.state, 'degraded')
    assert.equal(result.services.database.state, 'degraded')
    assert.equal(result.services.email.state, 'configured')
    assert.match(result.services.email.detail, /no prueba alcance del relay/)
  } finally {
    globalThis.fetch = originalFetch
    globalThis.window = originalWindow
  }
})
