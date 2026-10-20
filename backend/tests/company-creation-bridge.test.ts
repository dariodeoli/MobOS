import assert from 'node:assert/strict'
import { prepareCompanyCreation, CompanyCreationPreparationError } from '../lib/company-creation-bridge'

const baseMembership = {
  id: 'membership-1',
  accountId: 'account-1',
  tenantId: 'tenant-1',
  userId: 'user-1',
  role: 'OWNER',
  revokedAt: null,
  tenant: { id: 'tenant-1', name: 'Actual', slug: 'actual', archivedAt: null, settings: {} },
  user: { id: 'user-1', tenantId: 'tenant-1', name: 'Dueño', email: 'owner@example.com', status: 'ACTIVE', role: 'ADMIN' },
}

function dbWith(overrides: Partial<typeof baseMembership> = {}, account: { id: string } | null = { id: 'account-1' }) {
  const membership = { ...baseMembership, ...overrides }
  return {
    account: { findUnique: async () => account },
    tenantMembership: { findUnique: async () => membership },
  } as any
}

async function rejects(input: any, code: string) {
  await assert.rejects(() => prepareCompanyCreation(input), (error: any) => error instanceof CompanyCreationPreparationError && error.code === code)
}

const context = { accountId: 'account-1', tenantId: 'tenant-1', userId: 'user-1', companyName: 'Sucursal Centro' }

;(async () => {
  const prepared = await prepareCompanyCreation({ db: dbWith(), ...context })
  assert.equal(prepared.status, 'awaiting_app_confirmation')
  assert.equal(prepared.newCompanyRequiresOAuthConsent, true)
  assert.match(prepared.url, /^\/mi-cuenta\?/)
  assert.equal(new URL(`https://app.moboss.online${prepared.url}`).searchParams.get('nombre'), 'Sucursal Centro')
  assert.equal(new URL(`https://app.moboss.online${prepared.url}`).searchParams.get('expectedTenantId'), 'tenant-1')
  assert.equal(new URL(`https://app.moboss.online${prepared.url}`).searchParams.get('expectedUserId'), 'user-1')

  await rejects({ db: dbWith({ role: 'ADMIN' }), ...context }, 'COMPANY_CREATE_FORBIDDEN')
  await rejects({ db: dbWith({ user: { ...baseMembership.user!, role: 'VENDEDOR' } }), ...context }, 'COMPANY_CREATE_FORBIDDEN')
  await rejects({ db: dbWith({ user: { ...baseMembership.user!, status: 'INACTIVE' } }), ...context }, 'COMPANY_CREATE_FORBIDDEN')
  await rejects({ db: dbWith(), ...context, accountId: null }, 'COMPANY_CREATE_FORBIDDEN')
  await rejects({ db: dbWith(), ...context, userId: 'other-user' }, 'COMPANY_CREATE_FORBIDDEN')
  await rejects({ db: dbWith(), ...context, companyName: 'x' }, 'INVALID_NAME')
  await rejects({ db: dbWith({}, null), ...context }, 'ACCOUNT_NOT_FOUND')

  console.log('company-creation-bridge.test.ts: PASS (prepare-only, no writes or sessions)')
})().catch(error => { console.error(error); process.exitCode = 1 })
