import { randomBytes } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { hashToken, USER_ROLES } from './auth'
import { teamInvitationEmail } from './email'
import { dispatchEmailOutboxJob, enqueueEmail } from './email-outbox'

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const INVITATION_COOLDOWN_MS = 5 * 60 * 1000
export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validRole(value: unknown): value is (typeof USER_ROLES)[number] {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value)
}
export function validPermissions(value: unknown) {
  return value === null || value === undefined || (Array.isArray(value) && value.length <= 32 && value.every(permission => typeof permission === 'string' && /^[a-z]+:[a-z*]+$/.test(permission) && permission.length <= 64))
}
export function invitationStatus(invitation: { consumedAt: Date | null; revokedAt: Date | null; expiresAt: Date }, now = new Date()) {
  if (invitation.consumedAt) return 'ACCEPTED'
  if (invitation.revokedAt) return 'REVOKED'
  if (invitation.expiresAt <= now) return 'EXPIRED'
  return 'PENDING'
}
export function serializeInvitation(invitation: any) {
  return { id: invitation.id, email: invitation.email, name: invitation.name, role: invitation.role, branchId: invitation.branchId, permissions: invitation.permissions, expiresAt: invitation.expiresAt, sentAt: invitation.sentAt, resendAvailableAt: invitation.resendAvailableAt, consumedAt: invitation.consumedAt, revokedAt: invitation.revokedAt, status: invitationStatus(invitation) }
}
export function invitationToken() {
  const token = randomBytes(32).toString('hex')
  return { token, tokenHash: hashToken(`USER_INVITATION:${token}`) }
}
export async function enqueueInvitation(tx: Prisma.TransactionClient, input: { invitationId: string; tenantId: string; to: string; inviteeName: string; companyName: string; inviterName: string; token: string }) {
  const message = teamInvitationEmail(input)
  if (!message) throw new Error('EMAIL_UNCONFIGURED')
  return enqueueEmail(tx, { tenantId: input.tenantId, kind: 'team-invitation', aggregateType: 'UserInvitation', aggregateId: input.invitationId, message })
}
export async function deliverInvitation(jobId: string) {
  const result = await dispatchEmailOutboxJob(jobId)
  return result.state === 'sent' || result.state === 'already-sent'
}
export function permissionsData(value: unknown) {
  return value === null || value === undefined ? Prisma.JsonNull : value as Prisma.InputJsonValue
}
