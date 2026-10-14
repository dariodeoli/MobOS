import assert from 'node:assert/strict'
import { canCreateCompany, linkedUserBelongs, normalizeAccountEmail, passwordAccountDecision, roleForGoogleAccess, shouldKeepSeller } from '../lib/membership-rules'
import { openTenant, TenantSwitchError } from '../lib/tenant-switch'
import { defaultLinkedUser, ensureMembership, MembershipError, restoreMembershipsForUser, revokeAllMembershipsOfAccount, revokeGoogleMembership, revokeMembershipsForUser } from '../lib/membership'

// Multi-empresa (#377): reglas de prueba de propiedad y vínculo del perfil.
assert.equal(normalizeAccountEmail('  Dueno@Tienda.COM '), 'dueno@tienda.com')
assert.equal(normalizeAccountEmail(''), null)
assert.equal(normalizeAccountEmail(undefined), null)

const vivo = { tenantId: 't1', revokedAt: null }
const revocado = { tenantId: 't1', revokedAt: new Date() }
assert.equal(passwordAccountDecision(null, 't1'), 'create')
assert.equal(passwordAccountDecision({ googleSubject: null, memberships: [vivo] }, 't1'), 'reuse')
assert.equal(passwordAccountDecision({ googleSubject: null, memberships: [revocado] }, 't1'), 'revoked', 'una salida no se revive con la contraseña')
assert.equal(passwordAccountDecision({ googleSubject: null, memberships: [] }, 't1'), 'attach')
assert.equal(passwordAccountDecision({ googleSubject: null, memberships: [{ tenantId: 'otra', revokedAt: null }] }, 't1'), 'refuse', 'el correo reutilizado no hereda las empresas de otra persona')
assert.equal(passwordAccountDecision({ googleSubject: 'g-1', memberships: [] }, 't1'), 'refuse', 'una cuenta Google jamás se vincula solo por correo')

assert.equal(roleForGoogleAccess(true), 'OWNER')
assert.equal(roleForGoogleAccess(false), 'ADMIN')
const adminActivo = { role: 'ADMIN', status: 'ACTIVE' }
assert.equal(canCreateCompany('OWNER', adminActivo), true)
assert.equal(canCreateCompany('OWNER'), false, 'sin perfil vinculado no hay alta de empresas')
assert.equal(canCreateCompany('OWNER', null), false)
assert.equal(canCreateCompany('OWNER', { role: 'VENDEDOR', status: 'ACTIVE' }), false, 'el rol ACTUAL del perfil vinculado manda: bajarlo de ADMIN quita el alta')
assert.equal(canCreateCompany('OWNER', { role: 'ADMIN', status: 'INACTIVE' }), false, 'un perfil desactivado no crea empresas')
assert.equal(canCreateCompany('ADMIN', adminActivo), false)
assert.equal(canCreateCompany('MEMBER', adminActivo), false)
assert.equal(canCreateCompany(null, adminActivo), false)
assert.equal(shouldKeepSeller('u1', 'u1'), true)
assert.equal(shouldKeepSeller('u2', 'u1'), false, 'un compañero con su PIN no hereda el vendedor')
assert.equal(shouldKeepSeller('u1', null), false, 'sin perfil vinculado (usuario borrado) va a la pantalla de PIN')
assert.equal(shouldKeepSeller(null, 'u1'), false)
assert.equal(linkedUserBelongs({ tenantId: 'a' }, 'a'), true)
assert.equal(linkedUserBelongs({ tenantId: 'b' }, 'a'), false)
assert.equal(linkedUserBelongs(null, 'a'), true)

void (async () => {
  // El perfil de otra empresa nunca se vincula: toda escritura pasa por ensureMembership.
  const writes: unknown[] = []
  const db: any = {
    user: { findUnique: async ({ where }: any) => (where.id === 'u-a' ? { tenantId: 'A' } : where.id === 'u-b' ? { tenantId: 'B' } : null) },
    tenantMembership: { upsert: async (args: any) => { writes.push(args); return { id: 'm' } } },
  }
  await ensureMembership(db, { accountId: 'acc', tenantId: 'A', userId: 'u-a', role: 'ADMIN' })
  await ensureMembership(db, { accountId: 'acc', tenantId: 'A', userId: null, role: 'MEMBER' })
  assert.equal(writes.length, 2)
  await assert.rejects(ensureMembership(db, { accountId: 'acc', tenantId: 'A', userId: 'u-b', role: 'ADMIN' }), (error: unknown) => error instanceof MembershipError && error.code === 'INVALID_LINK')
  await assert.rejects(ensureMembership(db, { accountId: 'acc', tenantId: 'A', userId: 'inexistente', role: 'ADMIN' }), MembershipError)
  assert.equal(writes.length, 2, 'las escrituras rechazadas no tocan la base')

  // M1: el perfil vinculado sale SOLO de la coincidencia de correo (ADMIN activo); nunca "el más antiguo".
  const admins = [
    { id: 'viejo', email: 'otro@x.com', role: 'ADMIN', status: 'ACTIVE' },
    { id: 'inactivo', email: 'dueno@x.com', role: 'ADMIN', status: 'INACTIVE' },
    { id: 'coincide', email: 'Dueno@X.com', role: 'ADMIN', status: 'ACTIVE' },
  ]
  const dbAdmins: any = { user: { findMany: async ({ where }: any) => admins.filter(user => user.role === where.role && user.status === where.status) } }
  assert.equal(await defaultLinkedUser(dbAdmins, 't', 'dueno@x.com'), 'coincide', 'ADMIN activo con el mismo correo (sin distinguir mayúsculas)')
  assert.equal(await defaultLinkedUser(dbAdmins, 't', 'nadie@x.com'), null, 'sin coincidencia de correo: nulo (pantalla de PIN), no el ADMIN más antiguo')
  assert.equal(await defaultLinkedUser(dbAdmins, 't', null), null, 'sin correo: nulo')

  // M3: la baja registra el motivo y reactivar restaura SOLO lo que esa baja revocó.
  const calls: any[] = []
  const tx: any = {
    tenantMembership: {
      findMany: async () => [{ id: 'm1', accountId: 'a1' }],
      updateMany: async (args: any) => { calls.push(['membership', args]); return { count: 1 } },
    },
    session: { updateMany: async (args: any) => { calls.push(['session', args]); return { count: 2 } } },
    account: { findUnique: async ({ where }: any) => (where.googleSubject === 'g-1' ? { id: 'acc-g' } : null) },
  }
  const now = new Date('2026-10-14T00:00:00Z')
  await revokeMembershipsForUser(tx, 't1', 'u1', now)
  assert.equal(calls[0][1].data.revokedReason, 'USER_DEACTIVATED', 'la baja registra el motivo')
  await revokeMembershipsForUser(tx, 't1', 'u1', now, 'LEFT_STORE')
  assert.equal(calls[2][1].data.revokedReason, 'LEFT_STORE')
  calls.length = 0
  assert.equal(await restoreMembershipsForUser(tx, 't1', 'u1'), 1)
  assert.deepEqual(calls[0][1].where, { tenantId: 't1', userId: 'u1', revokedAt: { not: null }, revokedReason: 'USER_DEACTIVATED', account: { memberships: { none: { revokedReason: 'ACCOUNT_CLOSED' } } } }, 'solo restaura las revocadas por la baja del perfil y nunca las de una cuenta cerrada')
  assert.deepEqual(calls[0][1].data, { revokedAt: null, revokedReason: null })

  // Cierre de cuenta: las vivas pasan a ACCOUNT_CLOSED; de las ya revocadas solo la baja restaurable (la salida conserva su motivo).
  calls.length = 0
  await revokeAllMembershipsOfAccount(tx, 'a1', now)
  assert.deepEqual(calls[0][1].where, { accountId: 'a1', revokedAt: null })
  assert.equal(calls[0][1].data.revokedReason, 'ACCOUNT_CLOSED')
  assert.deepEqual(calls[1][1].where, { accountId: 'a1', revokedAt: { not: null }, revokedReason: 'USER_DEACTIVATED' }, 'no pisa LEFT_STORE ni otras revocaciones')
  assert.deepEqual(calls[1][1].data, { revokedReason: 'ACCOUNT_CLOSED' }, 'conserva la fecha de revocación original')

  // M2: al salir la dueña Google se revoca la pertenencia de SU cuenta Google y sus sesiones en esa tienda.
  calls.length = 0
  assert.equal(await revokeGoogleMembership(tx, 't1', 'g-1', now, 'LEFT_STORE'), true)
  assert.equal(calls[0][1].where.accountId, 'acc-g'); assert.equal(calls[0][1].where.tenantId, 't1')
  assert.equal(calls[1][0], 'session'); assert.equal(calls[1][1].where.accountId, 'acc-g')
  assert.equal(await revokeGoogleMembership(tx, 't1', 'g-sin-cuenta', now, 'LEFT_STORE'), false)

  // Baja: el cambio aborta si otra solicitud ya revocó alguna sesión presentada (carrera).
  const created: unknown[] = []
  const raceTx: any = {
    session: { updateMany: async () => ({ count: 1 }), create: async (args: unknown) => { created.push(args); return { id: 's' } } },
    auditLog: { create: async (args: unknown) => { created.push(args) } },
    tenant: { findUnique: async () => ({ archivedAt: null }) },
  }
  const ctx: any = { accountId: 'acc', tenantId: 'A', deviceId: 'd', userAgent: null, sessionIds: ['s1', 's2'], sellerUserId: 'u1' }
  await assert.rejects(openTenant(raceTx, ctx, new Request('https://app.moboss.online/x'), { id: 'm', userId: 'u1' }, 'B'), (error: unknown) => error instanceof TenantSwitchError && error.status === 409 && error.code === 'TENANT_SWITCH_RACE')
  assert.equal(created.length, 0, 'ante la carrera no se abre ninguna sesión ni se audita nada')

  console.log('membership.test: OK')

})().catch(error => { console.error(error); process.exit(1) })
