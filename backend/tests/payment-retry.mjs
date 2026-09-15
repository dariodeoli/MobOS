import assert from 'node:assert/strict'
const [base, token, orderId] = process.argv.slice(2)
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'synthetic-retry-00001' }
const payload = { orderId, method: 'TRANSFER', amountPyg: 10000, reference: 'Synthetic retry' }
const send = body => fetch(`${base}/api/payments`, { method: 'POST', headers, body: JSON.stringify(body) })
const responses = await Promise.all([send(payload), send(payload)])
for (const response of responses) assert.equal(response.status, 201)
const rows = await Promise.all(responses.map(r => r.json()))
assert.equal(rows[0].id, rows[1].id, 'El reintento debe devolver el mismo pago')
assert.equal((await send({ ...payload, amountPyg: 20000 })).status, 409)
const preflight = await fetch(`${base}/api/payments`, { method: 'OPTIONS', headers: { Origin: 'https://app.moboss.online', 'Access-Control-Request-Headers': 'idempotency-key' } })
assert.match(preflight.headers.get('access-control-allow-headers'), /Idempotency-Key/i)
console.log('Reintentos simultáneos: un único pago y rechazo de clave reutilizada para otro monto OK.')
