#!/usr/bin/env node

// Acceso de operador por PIN único: sin elegir vendedor, el PIN identifica
// al usuario dentro de la empresa (prioridad ADMIN > GERENTE > CAJERA >
// VENDEDOR). Uso: seller-pin.mjs <baseUrl> <companyToken>

import assert from 'node:assert/strict'

const [baseUrl, companyToken] = process.argv.slice(2)
if (!baseUrl || !companyToken) throw new Error('Uso: seller-pin.mjs <baseUrl> <companyToken>')

async function pin(body) {
  const response = await fetch(`${baseUrl}/api/auth/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${companyToken}` },
    body: JSON.stringify(body),
  })
  return { response, payload: await response.json().catch(() => null) }
}

const ok = await pin({ pin: '2468' })
assert.equal(ok.response.status, 200, JSON.stringify(ok.payload))
assert.equal(ok.payload.user.role, 'ADMIN', 'El PIN único debe resolver al administrador primero.')

const malo = await pin({ pin: '9999' })
assert.equal(malo.response.status, 401, 'Un PIN que no pertenece a nadie debe rechazarse.')

const ambiguo = await pin({ sellerId: 'user-a-it', pin: '2468' })
assert.equal(ambiguo.response.status, 200, JSON.stringify(ambiguo.payload))
assert.equal(ambiguo.payload.user.id, 'user-a-it', 'El flujo con vendedor explícito sigue intacto.')

console.log('seller-pin: checks OK (PIN único identifica al ADMIN, PIN desconocido 401 y vendedor explícito intacto).')
