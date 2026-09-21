import assert from 'node:assert/strict'

// #118 (Parte 2): la empresa sin cuentas de cobro recibe una sola vez las
// cuentas predeterminadas —los medios con logo de MedioPago.jsx— y una segunda
// lectura no duplica ninguna marca. Corre contra una empresa limpia (tenant C).
const [base, admin] = process.argv.slice(2)
if (!base || !admin) throw new Error('base y token admin requeridos')
const BRANDS = ['UENO BANK', 'POS UENO', 'PIK ITAÚ', 'DINELCO', 'DINERO', 'CONTINENTAL', 'FAMILIAR']
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
assert.equal(first.length, BRANDS.length, `la empresa vacía debe recibir solo las predeterminadas: ${JSON.stringify(first.map((a) => a.bank))}`)
checks++
for (const brand of BRANDS) {
  const rows = first.filter((account) => account.bank === brand)
  assert.equal(rows.length, 1, `marca duplicada o ausente: ${brand}`)
  assert.equal(rows[0].name, brand, `default de nombre inesperado en ${brand}: ${rows[0].name}`)
  assert.equal(rows[0].isActive, true, `la cuenta predeterminada quedó inactiva: ${brand}`)
  checks += 3
}

// Segunda lectura: idempotente (ni duplica ni resucita nada).
const second = await get('/api/payment-accounts')
assert.equal(second.length, first.length, 'la segunda lectura duplicó cuentas predeterminadas')
assert.deepEqual(second.map((a) => a.id).sort(), first.map((a) => a.id).sort(), 'la segunda lectura cambió las cuentas')
checks += 2

// Renombrar una predeterminada todavía incompleta (sin titular ni número) no
// puede quedar bloqueado: el banco se conserva para el logo.
const objetivo = first.find((account) => account.bank === 'UENO BANK')
const renamed = await patch(objetivo.id, { name: 'Cuenta Ueno empresa' })
assert.equal(renamed.name, 'Cuenta Ueno empresa', 'el renombre no se guardó')
assert.equal(renamed.bank, 'UENO BANK', 'el renombre no puede perder la marca')
checks += 2

// Desactivar y reactivar la cuenta incompleta también funciona.
assert.equal((await patch(objetivo.id, { isActive: false })).isActive, false, 'no se pudo desactivar la predeterminada')
assert.equal((await patch(objetivo.id, { isActive: true })).isActive, true, 'no se pudo reactivar la predeterminada')
checks += 2

// El alta de una transferencia sigue exigiendo banco, titular y número.
const incomplete = await fetch(base + '/api/payment-accounts', {
  method: 'POST',
  headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Transferencia incompleta', kind: 'TRANSFER', currency: 'PYG', bank: 'Banco X' }),
})
assert.equal(incomplete.status, 400, 'el alta de transferencia sin titular ni número debe rechazarse')
checks++

console.log(`Cuentas predeterminadas idempotentes y sin duplicados por marca: ${checks} comprobaciones OK`)
