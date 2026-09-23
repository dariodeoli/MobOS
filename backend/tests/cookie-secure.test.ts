import assert from 'node:assert/strict'
import test from 'node:test'
import { sameOrigin, sessionCookieOptions } from '../lib/google-oauth'

// El arnés e2e corre el build de producción sobre http://localhost
// (MOBOS_E2E_BACKEND=prod; `e2e/bin/start-backend.sh` exporta
// MOBOS_E2E_LOCAL_ORIGIN=1): ese origen local es confiable (`sameOrigin`) y la
// cookie de sesión no puede ser Secure —el navegador la descarta en http y el
// login no queda—. En producción real la variable no existe y nada cambia.

const peticion = (origin: string) =>
  new Request('http://localhost:3104/api/auth/me', { headers: { origin } })

const conEntorno = (cambios: Record<string, string | undefined>, fn: () => void) => {
  const previos: Record<string, string | undefined> = {}
  for (const clave of Object.keys(cambios)) {
    previos[clave] = process.env[clave]
    if (cambios[clave] === undefined) delete process.env[clave]
    else process.env[clave] = cambios[clave]
  }
  try { fn() } finally {
    for (const clave of Object.keys(cambios)) {
      if (previos[clave] === undefined) delete process.env[clave]
      else process.env[clave] = previos[clave]
    }
  }
}

test('en producción real (https) la cookie sigue siendo Secure y el origen valida', () => {
  conEntorno({ NODE_ENV: 'production', MOBOS_APP_URL: 'https://app.moboss.online', MOBOS_E2E_LOCAL_ORIGIN: undefined }, () => {
    assert.equal(sessionCookieOptions().secure, true)
    assert.equal(sameOrigin(peticion('https://app.moboss.online')), true)
    assert.equal(sameOrigin(peticion('http://localhost:5204')), false)
  })
})

test('sin el flag del arnés, http://localhost en producción no es un origen válido', () => {
  conEntorno({ NODE_ENV: 'production', MOBOS_APP_URL: 'http://localhost:5204', MOBOS_E2E_LOCAL_ORIGIN: undefined }, () => {
    assert.equal(sessionCookieOptions().secure, true)
    assert.equal(sameOrigin(peticion('http://localhost:5204')), false)
  })
})

test('el arnés local sobre http habilita el origen y la cookie sin Secure', () => {
  conEntorno({ NODE_ENV: 'production', MOBOS_APP_URL: 'http://localhost:5204', MOBOS_E2E_LOCAL_ORIGIN: '1' }, () => {
    const opciones = sessionCookieOptions()
    assert.equal(opciones.secure, false)
    assert.equal(opciones.httpOnly, true)
    assert.equal(opciones.sameSite, 'lax')
    assert.equal(sameOrigin(peticion('http://localhost:5204')), true)
  })
})

test('el flag no relaja un origen https real', () => {
  conEntorno({ NODE_ENV: 'production', MOBOS_APP_URL: 'https://app.moboss.online', MOBOS_E2E_LOCAL_ORIGIN: '1' }, () => {
    assert.equal(sessionCookieOptions().secure, true)
    assert.equal(sameOrigin(peticion('https://app.moboss.online')), true)
  })
})
