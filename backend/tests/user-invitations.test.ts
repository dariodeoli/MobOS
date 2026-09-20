import assert from 'node:assert/strict'
import test from 'node:test'
import { invitationStatus, serializeInvitation, validPermissions, validRole } from '../lib/user-invitations'

const base = {
  id: 'invite-1',
  email: 'persona@example.test',
  name: 'Persona Invitada',
  role: 'VENDEDOR',
  branchId: 'branch-1',
  permissions: null,
  inviterId: 'user-admin',
  inviter: { id: 'user-admin', name: 'Admin Test' },
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
  expiresAt: new Date('2030-01-01T10:00:00.000Z'),
  sentAt: new Date('2026-09-01T10:00:00.000Z'),
  resendAvailableAt: new Date('2026-09-01T10:05:00.000Z'),
  consumedAt: null,
  revokedAt: null,
}

test('serializeInvitation incluye autor, creación y estado pendiente', () => {
  const serialized = serializeInvitation(base)
  assert.equal(serialized.id, 'invite-1')
  assert.equal(serialized.inviterId, 'user-admin')
  assert.equal(serialized.inviterName, 'Admin Test')
  assert.equal(serialized.createdAt, base.createdAt)
  assert.equal(serialized.status, 'PENDING')
  assert.ok(!('tokenHash' in serialized) && !('token' in serialized))
})

test('el autor se resuelve desde inviterId cuando no hay relación cargada', () => {
  const serialized = serializeInvitation({ ...base, inviter: undefined })
  assert.equal(serialized.inviterId, 'user-admin')
  assert.equal(serialized.inviterName, null)
})

test('invitationStatus distingue aceptada, revocada, vencida y pendiente', () => {
  const now = new Date('2026-09-05T00:00:00.000Z')
  assert.equal(invitationStatus({ ...base, consumedAt: new Date() }, now), 'ACCEPTED')
  assert.equal(invitationStatus({ ...base, revokedAt: new Date() }, now), 'REVOKED')
  assert.equal(invitationStatus({ ...base, expiresAt: new Date('2026-09-04T00:00:00.000Z') }, now), 'EXPIRED')
  assert.equal(invitationStatus(base, now), 'PENDING')
  // Aceptada manda sobre revocada: la transición ganadora es la primera.
  assert.equal(invitationStatus({ ...base, consumedAt: new Date(), revokedAt: new Date() }, now), 'ACCEPTED')
})

test('validRole y validPermissions rechazan valores fuera del contrato', () => {
  assert.equal(validRole('VENDEDOR'), true)
  assert.equal(validRole('SUPERADMIN'), false)
  assert.equal(validPermissions(null), true)
  assert.equal(validPermissions(['ventas:crear']), true)
  assert.equal(validPermissions(['ventas:crear', 'invalida']), false)
  assert.equal(validPermissions('ventas:crear'), false)
})
