import assert from 'node:assert/strict'
import { createCustomer, CustomerServiceError, updateCustomer, type CustomerServiceActor } from '../lib/customer-service'

const actor: CustomerServiceActor = { id: 'user-a', tenantId: 'tenant-a', role: 'VENDEDOR', permissions: ['customers:manage'] }
const row = (overrides: Record<string, unknown> = {}) => ({ id: 'customer-a', tenantId: 'tenant-a', name: 'Ana Pérez', addresses: [], ...overrides })

function fakeDb(initial = row()) {
  const calls: { create?: any; update?: any; audits: any[] } = { audits: [] }
  const db = {
    customer: {
      findFirst: async ({ where }: any) => {
        if (where.id && where.id !== initial.id) return null
        if (where.tenantId !== initial.tenantId) return null
        if (where.id === initial.id) return initial
        if (where.OR && where.OR.some((item: any) => Object.values(item)[0] && Object.values(item)[0] === initial.document)) return initial
        return null
      },
      create: async ({ data }: any) => { calls.create = data; return row(data) },
      update: async ({ data }: any) => { calls.update = data; return row({ ...initial, ...data }) },
    },
    auditLog: { create: async ({ data }: any) => { calls.audits.push(data) } },
  }
  return { db: db as any, calls }
}

;(async () => {
  const created = fakeDb()
  const result = await createCustomer(created.db, actor, { name: '  Ana Pérez ', document: ' 123 ', addresses: [{ address: 'Av. España 1' }] })
  assert.equal(result.displayName, 'Ana Pérez')
  assert.equal(created.calls.create.name, 'Ana Pérez')
  assert.equal(created.calls.create.document, '123')
  assert.equal(created.calls.create.addresses.create[0].isDefault, true)
  assert.equal(created.calls.audits[0].tenantId, 'tenant-a')

  const updated = fakeDb(row({ document: 'old', email: 'old@example.invalid' }))
  await updateCustomer(updated.db, actor, 'customer-a', { email: 'new@example.invalid' })
  assert.equal(updated.calls.update.email, 'new@example.invalid')
  assert.equal('document' in updated.calls.update, false, 'editar email no debe borrar documento')
  assert.equal('addresses' in updated.calls.update, false, 'editar email no debe borrar direcciones')

  await assert.rejects(() => createCustomer(fakeDb().db, { ...actor, permissions: [] }, { name: 'Sin permiso' }), (error: unknown) => error instanceof CustomerServiceError && error.code === 'forbidden')
  await assert.rejects(() => updateCustomer(fakeDb().db, actor, 'otro-tenant-id', { email: 'x@example.invalid' }), (error: unknown) => error instanceof CustomerServiceError && error.code === 'not_found')
  console.log('customer-service: normalización, tenant/RBAC y preservación de campos OK')
})().catch(error => { console.error(error); process.exitCode = 1 })
