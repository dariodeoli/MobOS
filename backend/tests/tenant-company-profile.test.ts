import assert from 'node:assert/strict'
import { readTenantCompanyProfile, updateTenantCompanyProfile } from '../lib/tenant-company-profile'

function dbFixture() {
  const state = {
    tenant: { id: 'tenant-a', name: 'Tienda A', email: 'a@example.com', address: null as string | null, city: 'Asunción', department: null as string | null, phone: null as string | null, ruc: null as string | null },
    users: [
      { id: 'admin-a', tenantId: 'tenant-a', role: 'ADMIN', permissions: null, status: 'ACTIVE' },
      { id: 'seller-a', tenantId: 'tenant-a', role: 'VENDEDOR', permissions: null, status: 'ACTIVE' },
      { id: 'admin-b', tenantId: 'tenant-b', role: 'ADMIN', permissions: null, status: 'ACTIVE' },
    ],
    audits: [] as unknown[],
    sessions: [{ id: 'session-a', tenantId: 'tenant-a', userId: 'admin-a', revokedAt: null, expiresAt: new Date(Date.now() + 60_000), reauthenticatedAt: new Date() }],
  }
  const db = {
    user: { findFirst: async ({ where }: any) => state.users.find(user => user.id === where.id && user.tenantId === where.tenantId) ?? null },
    tenant: {
      findUnique: async ({ where }: any) => where.id === state.tenant.id ? { ...state.tenant } : null,
      findFirst: async ({ where }: any) => (where.email === state.tenant.email && where.id?.not !== state.tenant.id) ? { id: state.tenant.id } : null,
      update: async ({ data }: any) => Object.assign(state.tenant, data),
    },
    session: { findFirst: async ({ where }: any) => state.sessions.find(session => session.id === where.id && session.tenantId === where.tenantId && session.userId === where.userId) ?? null },
    auditLog: { create: async ({ data }: any) => { state.audits.push(data); return data } },
    $transaction: async (callback: any) => callback(db),
  }
  return { db: db as any, state }
}
(async () => {
const { db, state } = dbFixture()
const profile = await readTenantCompanyProfile({ db, tenantId: 'tenant-a', actorUserId: 'admin-a' })
assert.equal(profile.name, 'Tienda A')
assert.equal(profile.city, 'Asunción')
await assert.rejects(() => readTenantCompanyProfile({ db, tenantId: 'tenant-b', actorUserId: 'admin-a' }), /no pertenece/)
await assert.rejects(() => updateTenantCompanyProfile({ db, tenantId: 'tenant-a', actorUserId: 'seller-a', sessionId: 'session-a', fields: { name: 'No' } }), /permiso|dueño/)
state.sessions[0].reauthenticatedAt = new Date(Date.now() - 11 * 60_000)
await assert.rejects(() => updateTenantCompanyProfile({ db, tenantId: 'tenant-a', actorUserId: 'admin-a', sessionId: 'session-a', fields: { name: 'No' } }), /Reautenticación requerida/)
state.sessions[0].reauthenticatedAt = new Date()
await assert.rejects(() => updateTenantCompanyProfile({ db, tenantId: 'tenant-a', actorUserId: 'admin-a', sessionId: 'session-a', fields: { settings: '{}' } as any }), /datos públicos/)
const updated = await updateTenantCompanyProfile({ db, tenantId: 'tenant-a', actorUserId: 'admin-a', sessionId: 'session-a', fields: { name: 'Tienda Actualizada', ruc: '80000000-1', phone: '0981000000' } })
assert.equal(updated.name, 'Tienda Actualizada')
assert.equal(updated.ruc, '80000000-1')
assert.equal(updated.phone, '0981000000')
assert.equal(state.audits.length, 1)
assert.equal((state.audits[0] as any).action, 'TENANT_PROFILE_UPDATED')
assert.deepEqual((state.audits[0] as any).metadata.fields.sort(), ['name', 'phone', 'ruc'].sort())
console.log('tenant-company-profile: read/tenant/role/whitelist/mutation/audit PASS')
})().catch(error => { console.error(error); process.exitCode = 1 })
