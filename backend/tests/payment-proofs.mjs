import assert from 'node:assert/strict'

const [base, token, paymentId] = process.argv.slice(2)
const path = `/api/payments/${paymentId}`
const headers = { Authorization: `Bearer ${token}` }
async function upload(content, type) {
  const body = new FormData()
  body.set('file', new Blob([content], { type }), 'synthetic-proof.pdf')
  return fetch(`${base}${path}/proofs`, { method: 'POST', headers, body })
}
assert.equal((await fetch(`${base}${path}/proofs`)).status, 401)
assert.equal((await upload('<html>not a PDF</html>', 'application/pdf')).status, 415)
const bytes = '%PDF-1.4\n% Synthetic test fixture, not a customer document\n%%EOF'
const created = await upload(bytes, 'application/pdf')
assert.equal(created.status, 201)
const proof = await created.json()
assert.ok(proof.id)
assert.equal(proof.data, undefined)
const listed = await fetch(`${base}${path}/proofs`, { headers }).then(r => r.json())
assert.equal(listed.length, 1)
assert.equal(listed[0].data, undefined)
const downloaded = await fetch(`${base}${path}/proofs/${proof.id}`, { headers })
assert.equal(downloaded.status, 200)
assert.match(downloaded.headers.get('content-disposition'), /attachment/)
assert.equal(downloaded.headers.get('x-content-type-options'), 'nosniff')
assert.equal(await downloaded.text(), bytes)
assert.equal((await fetch(`${base}${path}/proofs/${proof.id}`)).status, 401)
const status = await fetch(`${base}${path}/reconciliation`, { headers })
assert.equal(status.status, 200)
assert.equal((await status.json()).state, 'PENDING')
assert.equal((await fetch(`${base}${path}/reconciliation`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ state: 'VERIFIED', note: 'Unauthorized seller test' }) })).status, 403)
console.log('Comprobantes: autenticación, MIME, carga, lista sin bytes, descarga privada y conciliación restringida OK.')
