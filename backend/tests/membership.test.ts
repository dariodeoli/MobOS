import assert from 'node:assert/strict'
import { canCreateCompany, linkedUserBelongs, normalizeAccountEmail, passwordAccountDecision, roleForGoogleAccess, shouldKeepSeller } from '../lib/membership-rules'
import { ensureMembership, MembershipError } from '../lib/membership'

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
assert.equal(canCreateCompany('OWNER'), true)
assert.equal(canCreateCompany('ADMIN'), false)
assert.equal(canCreateCompany('MEMBER'), false)
assert.equal(canCreateCompany(null), false)
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

  console.log('membership.test: OK')

})().catch(error => { console.error(error); process.exit(1) })
