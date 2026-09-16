#!/usr/bin/env node

// Regresión del salto interno del middleware: el navegador autentica con
// COOKIES (sin Bearer). El self-proxy no puede transportar `cookie` por
// undici; debe viajar por el canal interno firmado. Uso:
//   cookie-session.mjs <baseUrl> <adminToken>

import assert from 'node:assert/strict'

const [baseUrl, adminToken] = process.argv.slice(2)
if (!baseUrl || !adminToken) throw new Error('Uso: cookie-session.mjs <baseUrl> <adminToken>')

const ORIGIN_OK = 'https://app.moboss.online'

async function cashConCookie(origin) {
  const headers = { Cookie: `mobos_seller_session=${adminToken}` }
  if (origin) headers.Origin = origin
  const response = await fetch(`${baseUrl}/api/cash`, { headers })
  return { status: response.status, payload: await response.json().catch(() => null) }
}

const ok = await cashConCookie(ORIGIN_OK)
assert.equal(ok.status, 200, `La sesión por cookie debe autenticar con origin válido: ${JSON.stringify(ok.payload)}`)

const sinOrigin = await cashConCookie(null)
assert.equal(sinOrigin.status, 401, 'Sin origin el contrato sameOrigin debe rechazar la cookie.')

const originMal = await cashConCookie('https://otro-dominio.example')
assert.equal(originMal.status, 401, 'Un origin ajeno no debe autenticar la cookie.')

console.log('cookie-session: checks OK (cookie sobre self-proxy autentica, sameOrigin rechaza ausencia y origen ajeno).')
