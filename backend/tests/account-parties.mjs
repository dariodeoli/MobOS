import assert from 'node:assert/strict'

// #143: empresas/personas jurídicas privadas y titulares. Alta, edición,
// búsqueda por documento y vínculo con cuentas de cobro (con aislamiento por
// empresa). Corre contra el tenant C (limpio) del arnés.
const [base, admin] = process.argv.slice(2)
if (!base || !admin) throw new Error('base y token admin requeridos')
let checks = 0

async function req(path, method = 'GET', body, expected = 200) {
  const response = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json()
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`)
  checks++
  return data
}

// ── Titulares ─────────────────────────────────────────────────────────
const holder = await req('/api/account-holders', 'POST', { firstName: 'Ana', middleName: 'María', lastName: 'Pérez', secondLastName: 'Gómez', document: '1234567-8' })
assert.equal(holder.firstName, 'Ana')
assert.equal(holder.isActive, true)
checks += 2
// Sin apellido no se puede crear.
await req('/api/account-holders', 'POST', { firstName: 'Solo nombre' }, 400)
// Editar documento y desactivar.
const holderEditado = await req('/api/account-holders', 'PATCH', { id: holder.id, document: '1234567-9', isActive: false })
assert.equal(holderEditado.document, '1234567-9')
assert.equal(holderEditado.isActive, false)
checks += 2
// Vuelve a estar activo para usarlo en la cuenta.
await req('/api/account-holders', 'PATCH', { id: holder.id, isActive: true })

// ── Empresas privadas ─────────────────────────────────────────────────
const company = await req('/api/private-companies', 'POST', { legalName: 'Comercial QA S.A.', ruc: '80069563-1', legalAddress: 'Av. QA 123' })
assert.equal(company.legalName, 'Comercial QA S.A.')
checks++
await req('/api/private-companies', 'POST', { ruc: '80000000-0' }, 400)
const companyEditada = await req('/api/private-companies', 'PATCH', { id: company.id, legalAddress: 'Av. QA 456' })
assert.equal(companyEditada.legalAddress, 'Av. QA 456')
checks++

// ── Cuenta con titular y empresa ──────────────────────────────────────
const account = await req('/api/payment-accounts', 'POST', {
  name: 'Cuenta con titular QA', kind: 'TRANSFER', currency: 'PYG', bank: 'Banco QA',
  holder: 'Ana María Pérez Gómez', accountNumber: 'QA-2', holderId: holder.id, companyId: company.id,
})
assert.equal(account.holderId, holder.id)
assert.equal(account.companyId, company.id)
checks += 2
// Un titular que no existe en la empresa no se acepta.
await req('/api/payment-accounts', 'POST', { name: 'Cuenta ajena QA', kind: 'TRANSFER', currency: 'PYG', bank: 'X', holder: 'Y', accountNumber: 'Z', holderId: 'no-existe' }, 400)
await req('/api/payment-accounts', 'POST', { name: 'Cuenta ajena QA 2', kind: 'TRANSFER', currency: 'PYG', bank: 'X', holder: 'Y', accountNumber: 'Z', companyId: 'no-existe' }, 400)

// ── Listados ──────────────────────────────────────────────────────────
const holders = await req('/api/account-holders')
assert.ok(holders.some((row) => row.id === holder.id))
const companies = await req('/api/private-companies')
assert.ok(companies.some((row) => row.id === company.id))
checks += 2

console.log(`Empresas privadas y titulares: ${checks} comprobaciones OK`)
