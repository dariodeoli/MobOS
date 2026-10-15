import assert from 'node:assert/strict'

// #486: GET no crea bancos ni cuentas y las cuentas reales siguen siendo configurables.
const [base, admin] = process.argv.slice(2)
if (!base || !admin) throw new Error('base y token admin requeridos')
let checks = 0

async function get(path, token = admin) {
  const response = await fetch(base + path, { headers: { Authorization: `Bearer ${token}` } })
  const data = await response.json()
  assert.equal(response.status, 200, `GET ${path}: ${JSON.stringify(data)}`)
  checks++
  return data
}

async function patch(id, body, expected = 200) {
  const response = await fetch(base + '/api/payment-accounts', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...body }),
  })
  const data = await response.json()
  assert.equal(response.status, expected, `PATCH payment-account: ${JSON.stringify(data)}`)
  checks++
  return data
}

const first = await get('/api/payment-accounts')
assert.deepEqual(first, [], 'una empresa vacía no debe recibir cuentas ficticias')
const concurrent = await Promise.all(Array.from({ length: 4 }, () => get('/api/payment-accounts')))
for (const rows of concurrent) assert.deepEqual(rows, [], 'leer en paralelo no debe sembrar cuentas')
checks += 5

// Una cuenta explícitamente creada es editable, sin resucitar los ejemplos.
const explicit = await fetch(base + '/api/payment-accounts', { method: 'POST', headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Efectivo de mi empresa', kind: 'CASH', currency: 'PYG' }) })
assert.equal(explicit.status, 201)
const objetivo = await explicit.json()
const renamed = await patch(objetivo.id, { name: 'Caja principal' })
assert.equal(renamed.name, 'Caja principal')
assert.equal((await patch(objetivo.id, { isActive: false })).isActive, false)
assert.equal((await patch(objetivo.id, { isActive: true })).isActive, true)
assert.deepEqual((await get('/api/payment-accounts')).map(a => a.id), [objetivo.id])
checks += 5

// El alta de una transferencia sigue exigiendo banco, titular y número.
const incomplete = await fetch(base + '/api/payment-accounts', {
  method: 'POST',
  headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Transferencia incompleta', kind: 'TRANSFER', currency: 'PYG', bank: 'Banco X' }),
})
assert.equal(incomplete.status, 400, 'el alta de transferencia sin titular ni número debe rechazarse')
checks++

// Medios configurables (#142): cada medio valida su moneda y guarda sus datos.
async function post(body, expected = 201) {
  const response = await fetch(base + '/api/payment-accounts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  assert.equal(response.status, expected, `POST payment-account: ${JSON.stringify(data)}`)
  checks++
  return data
}
const pix = await post({ name: 'Pix QA', kind: 'PIX', currency: 'BRL', pixKey: 'qa@pix.example', holder: 'Titular Pix' })
assert.equal(pix.currency, 'BRL')
assert.equal(pix.pixKey, 'qa@pix.example')
checks += 2
await post({ name: 'Pix mal', kind: 'PIX', currency: 'PYG' }, 400)
const usdt = await post({ name: 'USDT QA', kind: 'CRYPTO', currency: 'USD', reference: 'TRC20 QA', holder: 'Titular Cripto' })
assert.equal(usdt.currency, 'USD')
assert.equal(usdt.reference, 'TRC20 QA')
checks += 2
await post({ name: 'USDT mal', kind: 'CRYPTO', currency: 'PYG' }, 400)
// La transferencia no mezcla USDT: tiene su propio medio (#204).
await post({ name: 'Transferencia USDT', kind: 'TRANSFER', currency: 'USDT', bank: 'Banco QA', holder: 'Ana QA', accountNumber: 'QA-USDT' }, 400)
const transfer = await post({ name: 'Transferencia QA #142', kind: 'TRANSFER', currency: 'PYG', bank: 'Banco QA', holder: 'Ana QA', accountNumber: 'QA-1', document: '1234567-8' })
assert.equal(transfer.document, '1234567-8')
assert.equal(transfer.processor, null)
checks += 2

console.log(`Cuentas reales sin siembra automática: ${checks} comprobaciones OK`)
