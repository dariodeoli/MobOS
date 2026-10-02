import assert from 'node:assert/strict'
import test from 'node:test'
import { checkMobosStatus, resumenEstadoPublico } from './checks.js'

// #295: la página pública no puede anunciar degradación cuando el chequeo solo
// no tenía permisos (reservas 401), cuando el correo solo prueba configuración
// o cuando el sitio de la app no autoriza CORS a `moboss.online`.

function stubFetch(handler) {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  const llamadas = []
  globalThis.window = { setTimeout, clearTimeout }
  globalThis.fetch = async (url, options = {}) => {
    llamadas.push({ url: String(url), options })
    return handler(String(url), options)
  }
  return {
    llamadas,
    restaurar() {
      globalThis.fetch = originalFetch
      globalThis.window = originalWindow
    },
  }
}

const healthOk = () => Response.json({ ok: true, services: { api: 'operational', database: 'operational', email: 'configured' } })

test('status: con la app y el API sanos, lo que requiere sesión no degrada', async () => {
  const stub = stubFetch(async (url) => {
    if (url.includes('/api/health')) return healthOk()
    if (url.includes('/api/auth/google')) return Response.json({ configured: true })
    if (url.includes('/api/inventory-reservations')) return new Response(null, { status: 401 })
    return new Response(null, { status: 200 })
  })
  try {
    const result = await checkMobosStatus()
    assert.equal(result.services.app.state, 'operational')
    assert.equal(result.services.api.state, 'operational')
    assert.equal(result.services.database.state, 'operational')
    assert.equal(result.services.auth.state, 'operational')
    assert.equal(result.services.email.state, 'unverifiable')
    assert.match(result.services.email.detail, /no es verificable públicamente/)
    assert.equal(result.services.reservations.state, 'restricted')
    assert.match(result.services.reservations.detail, /sesión autorizada/)

    const resumen = resumenEstadoPublico(result.services)
    assert.equal(resumen.degradado, false, 'una reserva con sesión no es una caída')
    assert.equal(resumen.operativos, 4)
    assert.equal(resumen.restringidos, 1)
    assert.equal(resumen.noVerificables, 1)

    // El chequeo del sitio de la app no puede usar CORS normal (#295).
    const delApp = stub.llamadas.find((llamada) => llamada.url.includes('app.moboss.online'))
    assert.equal(delApp?.options?.mode, 'no-cors')
    assert.equal(stub.llamadas.some((llamada) => llamada.url.includes('/api/auth/password-recovery')), false)
    assert.equal(stub.llamadas.filter((llamada) => llamada.url.includes('/api/health')).length, 1)
  } finally {
    stub.restaurar()
  }
})

test('status: el correo configurado se informa como no verificable públicamente', async () => {
  const stub = stubFetch(async (url) => {
    if (url.includes('/api/health')) return healthOk()
    if (url.includes('/api/auth/google')) return Response.json({ configured: true })
    if (url.includes('/api/inventory-reservations')) return new Response(null, { status: 401 })
    return new Response(null, { status: 200 })
  })
  try {
    const result = await checkMobosStatus()
    assert.equal(result.services.email.state, 'unverifiable')
    assert.match(result.services.email.detail, /no es verificable públicamente/)
  } finally {
    stub.restaurar()
  }
})

test('status: con la base caída el API sigue operativo y la base es la degradada', async () => {
  const stub = stubFetch(async (url) => {
    if (url.includes('/api/health')) return Response.json({ ok: false, services: { api: 'operational', database: 'unavailable', email: 'configured' } }, { status: 503 })
    if (url.includes('/api/auth/google')) return Response.json({ configured: true })
    if (url.includes('/api/inventory-reservations')) return new Response(null, { status: 401 })
    return new Response(null, { status: 200 })
  })
  try {
    const result = await checkMobosStatus()
    assert.equal(result.services.api.state, 'operational', 'el API responde aunque la base no')
    assert.equal(result.services.database.state, 'degraded')
    assert.equal(result.services.email.state, 'unverifiable')
    const resumen = resumenEstadoPublico(result.services)
    assert.equal(resumen.degradado, true)
    assert.equal(resumen.degradados, 1)
  } finally {
    stub.restaurar()
  }
})

test('status: el correo sin configurar sí es una degradación verificable', async () => {
  const stub = stubFetch(async (url) => {
    if (url.includes('/api/health')) return Response.json({ ok: true, services: { api: 'operational', database: 'operational', email: 'unconfigured' } })
    if (url.includes('/api/auth/google')) return Response.json({ configured: true })
    if (url.includes('/api/inventory-reservations')) return new Response(null, { status: 401 })
    return new Response(null, { status: 200 })
  })
  try {
    const result = await checkMobosStatus()
    assert.equal(result.services.email.state, 'degraded')
    assert.match(result.services.email.detail, /no está configurado/)
  } finally {
    stub.restaurar()
  }
})

test('status: Google OAuth no configurado se reporta degradado, no inventado', async () => {
  const stub = stubFetch(async (url) => {
    if (url.includes('/api/health')) return healthOk()
    if (url.includes('/api/auth/google')) return Response.json({ code: 'not_configured' }, { status: 503 })
    if (url.includes('/api/inventory-reservations')) return new Response(null, { status: 401 })
    return new Response(null, { status: 200 })
  })
  try {
    const result = await checkMobosStatus()
    assert.equal(result.services.auth.state, 'degraded')
    assert.match(result.services.auth.detail, /no está configurado/)
  } finally {
    stub.restaurar()
  }
})

test('status: sin respuesta de nadie, todo se informa como no verificable (sin degradación inventada)', async () => {
  const stub = stubFetch(async () => { throw new TypeError('Failed to fetch') })
  try {
    const result = await checkMobosStatus()
    for (const servicio of ['app', 'api', 'database', 'auth', 'email', 'reservations']) {
      assert.equal(result.services[servicio].state, 'unverifiable', `${servicio} sin respuesta no es una caída verificada`)
    }
    const resumen = resumenEstadoPublico(result.services)
    assert.equal(resumen.degradado, false)
    assert.equal(resumen.operativos, 0)
    assert.equal(resumen.noVerificables, 6)
  } finally {
    stub.restaurar()
  }
})

test('status: un error real del endpoint de reservas sí es degradación', async () => {
  const stub = stubFetch(async (url) => {
    if (url.includes('/api/health')) return healthOk()
    if (url.includes('/api/auth/google')) return Response.json({ configured: true })
    if (url.includes('/api/inventory-reservations')) return new Response(null, { status: 500 })
    return new Response(null, { status: 200 })
  })
  try {
    const result = await checkMobosStatus()
    assert.equal(result.services.reservations.state, 'degraded')
    assert.equal(resumenEstadoPublico(result.services).degradado, true)
  } finally {
    stub.restaurar()
  }
})
