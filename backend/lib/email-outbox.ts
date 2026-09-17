import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { logEmailOutcome, sendTransactionalEmail } from './email'
import { decryptEmailOutboxPayload, encryptEmailOutboxPayload } from './email-outbox-crypto'
import { prisma } from './prisma'

export type OutboxKind = 'password-recovery' | 'email-verification' | 'welcome' | 'team-invitation' | 'receipt' | 'payment-due' | 'payment-overdue' | 'warranty-update' | 'reservation-due'
type PreparedEmail = { to: string; subject: string; html: string; text: string }

const LOCK_TIMEOUT_MS = 60_000
export const EMAIL_OUTBOX_MAX_ATTEMPTS = 5
export const EMAIL_OUTBOX_RETRY_BASE_MS = 30_000
export const EMAIL_OUTBOX_RETRY_MAX_MS = 15 * 60_000

type TestHooks = {
  beforeCommit?: (entrypoint: string) => void | Promise<void>
  beforeMarkSent?: (job: { id: string; kind: string; aggregateType: string; aggregateId: string }) => void | Promise<void>
}
let testHooks: TestHooks = {}

export function setEmailOutboxTestHooks(hooks: TestHooks) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Email outbox test hooks are unavailable outside tests.')
  testHooks = hooks
}

export async function withEmailOutboxTransaction<T>(entrypoint: string, work: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async tx => {
    const result = await work(tx)
    await testHooks.beforeCommit?.(entrypoint)
    return result
  })
}

export async function enqueueEmail(
  tx: Pick<Prisma.TransactionClient, 'emailOutbox'>,
  input: { tenantId: string; kind: OutboxKind; aggregateType: string; aggregateId: string; message: PreparedEmail },
) {
  const id = randomUUID()
  const idempotencyKey = `mobos-outbox-${id}`
  const binding = { id, tenantId: input.tenantId, kind: input.kind, recipient: input.message.to, aggregateType: input.aggregateType, aggregateId: input.aggregateId, idempotencyKey }
  return tx.emailOutbox.create({
    data: {
      id,
      tenantId: input.tenantId,
      kind: input.kind,
      recipient: input.message.to,
      payload: encryptEmailOutboxPayload({ subject: input.message.subject, html: input.message.html, text: input.message.text }, binding),
      idempotencyKey,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
    },
    select: { id: true },
  })
}

export async function pendingEmailForAggregate(tx: Prisma.TransactionClient, aggregateType: string, aggregateId: string) {
  return tx.emailOutbox.findFirst({
    where: { aggregateType, aggregateId, sentAt: null, cancelledAt: null, failedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
}

export async function dispatchEmailOutboxJob(id: string) {
  const claimedAt = new Date()
  const staleBefore = new Date(claimedAt.getTime() - LOCK_TIMEOUT_MS)
  const job = await prisma.$transaction(async tx => {
    const claimed = await tx.emailOutbox.updateMany({
      where: { id, sentAt: null, cancelledAt: null, failedAt: null, attempts: { lt: EMAIL_OUTBOX_MAX_ATTEMPTS }, availableAt: { lte: claimedAt }, OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }] },
      data: { lockedAt: claimedAt },
    })
    if (!claimed.count) {
      const current = await tx.emailOutbox.findUnique({ where: { id }, select: { sentAt: true, cancelledAt: true, failedAt: true, availableAt: true } })
      if (current?.sentAt) return { state: 'already-sent' as const }
      if (current?.cancelledAt) return { state: 'cancelled' as const }
      if (current?.failedAt) return { state: 'failed' as const }
      return current?.availableAt && current.availableAt > claimedAt ? { state: 'deferred' as const } : { state: 'busy' as const }
    }
    const current = await tx.emailOutbox.findUniqueOrThrow({ where: { id } })
    return { state: 'claimed' as const, job: current }
  })
  if (job.state !== 'claimed') return job

  let payload: { subject?: unknown; html?: unknown; text?: unknown } = {}
  let payloadError = false
  try {
    payload = decryptEmailOutboxPayload(job.job.payload, job.job) as typeof payload
  } catch {
    payloadError = true
  }
  const validPayload = typeof payload.subject === 'string' && typeof payload.html === 'string' && typeof payload.text === 'string'
  const delivered = validPayload && await sendTransactionalEmail({
    to: job.job.recipient,
    subject: payload.subject as string,
    html: payload.html as string,
    text: payload.text as string,
    idempotencyKey: job.job.idempotencyKey,
  })
  if (!delivered) {
    const nextAttempts = job.job.attempts + 1
    const terminal = payloadError || !validPayload || nextAttempts >= EMAIL_OUTBOX_MAX_ATTEMPTS
    const errorCode = validPayload && !payloadError ? 'relay-rejected' : 'invalid-payload'
    const retryDelayMs = Math.min(EMAIL_OUTBOX_RETRY_BASE_MS * (2 ** Math.max(0, nextAttempts - 1)), EMAIL_OUTBOX_RETRY_MAX_MS)
    await prisma.$transaction(async tx => {
      const released = await tx.emailOutbox.updateMany({
        where: { id, sentAt: null, lockedAt: claimedAt },
        data: terminal
          ? { lockedAt: null, failedAt: new Date(), attempts: nextAttempts, lastError: errorCode, recipient: '', payload: '' }
          : { lockedAt: null, attempts: nextAttempts, availableAt: new Date(Date.now() + retryDelayMs), lastError: errorCode },
      })
      if (!released.count) return
      const action = {
        'password-recovery': 'PASSWORD_RECOVERY_DELIVERY_FAILED',
        'email-verification': 'EMAIL_VERIFICATION_DELIVERY_FAILED',
        welcome: 'WELCOME_EMAIL_DELIVERY_FAILED',
        'team-invitation': 'USER_INVITATION_DELIVERY_FAILED',
        'payment-due': 'PAYMENT_DUE_DELIVERY_FAILED',
        'payment-overdue': 'PAYMENT_OVERDUE_DELIVERY_FAILED',
        'warranty-update': 'WARRANTY_STATUS_DELIVERY_FAILED',
        'reservation-due': 'RESERVATION_DUE_DELIVERY_FAILED',
      }[job.job.kind]
      if (action) await tx.auditLog.create({ data: { tenantId: job.job.tenantId, action: terminal ? `${action}_DEAD_LETTERED` : action, entity: job.job.aggregateType, entityId: job.job.aggregateId, metadata: { outboxId: id, attempt: nextAttempts, terminal, errorCode } } })
    })
    logEmailOutcome(job.job.kind as OutboxKind, 'delivery-failed')
    return terminal ? { state: 'failed' as const } : { state: 'retryable' as const }
  }

  await testHooks.beforeMarkSent?.({ id: job.job.id, kind: job.job.kind, aggregateType: job.job.aggregateType, aggregateId: job.job.aggregateId })
  await prisma.$transaction(async tx => {
    const marked = await tx.emailOutbox.updateMany({ where: { id, sentAt: null, failedAt: null, lockedAt: claimedAt }, data: { sentAt: new Date(), lockedAt: null, lastError: null, recipient: '', payload: '' } })
    if (!marked.count) return
    if (job.job.kind === 'welcome') await tx.tenant.updateMany({ where: { id: job.job.tenantId, welcomeEmailSentAt: null }, data: { welcomeEmailSentAt: new Date() } })
  })
  logEmailOutcome(job.job.kind as OutboxKind, 'delivered-to-relay')
  return { state: 'sent' as const }
}

export async function dispatchPendingEmailOutbox(limit = 25) {
  const jobs = await prisma.emailOutbox.findMany({
    where: { sentAt: null, cancelledAt: null, failedAt: null, attempts: { lt: EMAIL_OUTBOX_MAX_ATTEMPTS }, availableAt: { lte: new Date() } },
    orderBy: { createdAt: 'asc' },
    take: Math.max(1, Math.min(limit, 100)),
    select: { id: true },
  })
  return Promise.all(jobs.map(job => dispatchEmailOutboxJob(job.id)))
}
