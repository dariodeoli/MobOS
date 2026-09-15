import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
import bcrypt from 'bcryptjs'

const require = createRequire(import.meta.url)
const backend = dirname(dirname(fileURLToPath(import.meta.url)))
const ts = require('typescript')
const pgBin = process.env.PG_BIN || '/opt/homebrew/bin'
const port = await new Promise(resolve => { const server = createServer(); server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolve(value)) }) })
const root = mkdtempSync(join(tmpdir(), 'mobos-email-'))
const pgdata = join(root, 'pgdata')
const dbUrl = `postgresql://postgres@127.0.0.1:${port}/email_test`
const run = (bin, args, input) => execFileSync(join(pgBin, bin), args, { input, stdio: ['pipe', 'pipe', 'pipe'] })
let started = false, prisma, checks = 0
const originalFetch = globalThis.fetch
const originalInfo = console.info
const ok = (condition, label) => { assert.ok(condition, label); checks++ }
try {
  run('initdb', ['-D', pgdata, '--username=postgres', '--auth=trust', '--no-locale', '--encoding=UTF8'])
  run('pg_ctl', ['-D', pgdata, '-l', join(root, 'pg.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${root}`, '-w', 'start']); started = true
  run('createdb', ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', 'email_test'])
  for (const entry of readdirSync(join(backend, 'prisma/migrations'), { withFileTypes: true }).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', dbUrl], readFileSync(join(backend, 'prisma/migrations', entry.name, 'migration.sql')))
  Object.assign(process.env, { DATABASE_URL: dbUrl, NODE_ENV: 'test', MOBOS_APP_URL: 'https://app.example.test', WEEM_EMAIL_RELAY_URL: 'https://relay.example.test/api/internal/email/send', WEEM_EMAIL_RELAY_TOKEN: 'synthetic-relay-token', MOBOS_MAINTENANCE_TOKEN: 'synthetic-maintenance-token', MOBOS_EMAIL_OUTBOX_ACTIVE_KEY_ID: 'test-v1', MOBOS_EMAIL_OUTBOX_ENCRYPTION_KEYS_JSON: JSON.stringify({ 'test-v1': Buffer.alloc(32, 7).toString('base64') }) })
  require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, path)
  ;({ prisma } = require('../lib/prisma.ts'))
  const auth = require('../lib/auth.ts')
  const actions = require('../lib/email-actions.ts')
  const email = require('../lib/email.ts')
  const outbox = require('../lib/email-outbox.ts')
  const recover = require('../app/api/auth/password-recovery/route.ts').POST
  const resetPassword = require('../app/api/auth/password-reset/route.ts').POST
  const register = require('../app/api/auth/register/route.ts').POST
  const verify = require('../app/api/auth/email-verification/verify/route.ts').POST
  const resendVerification = require('../app/api/auth/email-verification/resend/route.ts').POST
  const invitations = require('../app/api/user-invitations/route.ts')
  const resendInvitation = require('../app/api/user-invitations/[id]/resend/route.ts').POST
  const revokeInvitation = require('../app/api/user-invitations/[id]/revoke/route.ts').POST
  const acceptInvitation = require('../app/api/user-invitations/accept/route.ts').POST
  const users = require('../app/api/users/route.ts')
  const processOutbox = require('../app/api/internal/email-outbox/route.ts').POST

  const deliveries = []
  const logs = []
  let relayOk = true
  console.info = line => logs.push(String(line))
  globalThis.fetch = async (url, options) => {
    assert.equal(url, process.env.WEEM_EMAIL_RELAY_URL)
    const payload = JSON.parse(options.body)
    deliveries.push({ payload, headers: options.headers })
    return Response.json({ ok: relayOk }, { status: relayOk ? 200 : 503 })
  }
  const pinHash = await bcrypt.hash('7391', 4)
  async function seedTenant(id, email) {
    const tenant = await prisma.tenant.create({ data: { id, name: `Store ${id}`, slug: id, email, passwordHash: await bcrypt.hash('password-123', 4) } })
    const admin = await prisma.user.create({ data: { tenantId: id, name: `Admin ${id}`, email, pinHash, role: 'ADMIN' } })
    const bearer = `session-${id}-${'x'.repeat(32)}`
    await prisma.session.create({ data: { tenantId: id, userId: admin.id, level: 'SELLER', deviceId: 'test', tokenHash: auth.hashToken(bearer), expiresAt: new Date(Date.now() + 60_000) } })
    return { tenant, admin, bearer }
  }
  const one = await seedTenant('tenant-one', 'owner-one@example.test')
  const two = await seedTenant('tenant-two', 'owner-two@example.test')
  const rollbackTenant = await seedTenant('tenant-rollback', 'rollback@example.test')
  const crashTenant = await seedTenant('tenant-crash', 'crash@example.test')
  const deadLetterTenant = await seedTenant('tenant-dead-letter', 'dead-letter@example.test')
  const tamperTenant = await seedTenant('tenant-tamper', 'tamper@example.test')
  const recipientTamperTenant = await seedTenant('tenant-recipient-tamper', 'recipient-tamper@example.test')
  const request = (path, body, bearer) => new Request(`https://api.example.test${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify(body) })
  const get = (path, bearer) => new Request(`https://api.example.test${path}`, { headers: { Authorization: `Bearer ${bearer}` } })
  const bodyOf = response => response.json()
  const lastToken = () => decodeURIComponent(deliveries.at(-1).payload.text.match(/#token=([a-f0-9]{64})/i)?.[1] || '')
  const maintenanceRequest = token => new Request('https://api.example.test/api/internal/email-outbox', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })

  const registered = await register(request('/api/auth/register', { companyName: 'Password Store', email: 'password-owner@example.test', password: 'password-123', deviceId: 'register-test' }))
  assert.equal(registered.status, 201); checks++
  const registeredTenant = await prisma.tenant.findUnique({ where: { email: 'password-owner@example.test' } })
  ok(registeredTenant && registeredTenant.emailVerifiedAt === null, 'password registration remains usable while verification is pending')
  ok(await prisma.emailVerificationToken.count({ where: { tenantId: registeredTenant.id, consumedAt: null, revokedAt: null } }) === 1, 'password registration creates a purpose-bound verification token')

  async function withCommitFailure(entrypoint, invoke) {
    let injected = false
    outbox.setEmailOutboxTestHooks({ beforeCommit: label => {
      if (!injected && label === entrypoint) { injected = true; throw new Error(`synthetic ${entrypoint} commit failure`) }
    } })
    try { return await invoke() } finally { outbox.setEmailOutboxTestHooks({}) }
  }

  const resetCountBeforeRollback = await prisma.passwordResetToken.count({ where: { tenantId: rollbackTenant.tenant.id } })
  const verificationCountBeforeRollback = await prisma.emailVerificationToken.count({ where: { tenantId: rollbackTenant.tenant.id } })
  const outboxCountBeforeRollback = await prisma.emailOutbox.count({ where: { tenantId: rollbackTenant.tenant.id } })
  const deliveriesBeforeRollback = deliveries.length
  assert.equal((await withCommitFailure('password-recovery', () => recover(request('/api/auth/password-recovery', { email: rollbackTenant.tenant.email })))).status, 202); checks++
  assert.equal(await prisma.passwordResetToken.count({ where: { tenantId: rollbackTenant.tenant.id } }), resetCountBeforeRollback); checks++
  assert.equal(await prisma.emailOutbox.count({ where: { tenantId: rollbackTenant.tenant.id } }), outboxCountBeforeRollback); checks++
  assert.equal((await withCommitFailure('email-verification', () => resendVerification(request('/api/auth/email-verification/resend', { email: rollbackTenant.tenant.email })))).status, 202); checks++
  assert.equal(await prisma.emailVerificationToken.count({ where: { tenantId: rollbackTenant.tenant.id } }), verificationCountBeforeRollback); checks++
  assert.equal(await prisma.emailOutbox.count({ where: { tenantId: rollbackTenant.tenant.id } }), outboxCountBeforeRollback); checks++
  assert.equal((await withCommitFailure('invitation-create', () => invitations.POST(request('/api/user-invitations', { name: 'Rollback Invite', email: 'rollback-invite@example.test', role: 'VENDEDOR' }, one.bearer)))).status, 500); checks++
  assert.equal(await prisma.userInvitation.count({ where: { tenantId: one.tenant.id, email: 'rollback-invite@example.test' } }), 0); checks++
  assert.equal(await prisma.emailOutbox.count({ where: { aggregateType: 'UserInvitation', recipient: 'rollback-invite@example.test' } }), 0); checks++
  assert.equal(deliveries.length, deliveriesBeforeRollback); checks++

  let crashInjected = false
  outbox.setEmailOutboxTestHooks({ beforeMarkSent: job => {
    if (!crashInjected && job.kind === 'password-recovery' && job.aggregateType === 'PasswordResetToken') {
      crashInjected = true
      throw new Error('synthetic crash after relay acceptance')
    }
  } })
  const crashDeliveriesBefore = deliveries.length
  assert.equal((await recover(request('/api/auth/password-recovery', { email: crashTenant.tenant.email }))).status, 202); checks++
  outbox.setEmailOutboxTestHooks({})
  assert.equal(deliveries.length - crashDeliveriesBefore, 1); checks++
  const crashToken = lastToken()
  const crashReset = await prisma.passwordResetToken.findFirst({ where: { tenantId: crashTenant.tenant.id, usedAt: null } })
  const crashJob = await prisma.emailOutbox.findFirst({ where: { aggregateType: 'PasswordResetToken', aggregateId: crashReset.id } })
  const crashKey = deliveries.at(-1).headers['Idempotency-Key']
  assert.equal(crashJob.sentAt, null); checks++
  assert.equal(crashJob.idempotencyKey, `mobos-outbox-${crashJob.id}`); checks++
  assert.equal(crashKey, crashJob.idempotencyKey); checks++
  ok(!crashKey.includes(crashToken.slice(0, 24)), 'provider idempotency identity is independent from the credential')
  await prisma.emailOutbox.update({ where: { id: crashJob.id }, data: { lockedAt: new Date(Date.now() - 61_000), availableAt: new Date(Date.now() - 1_000) } })
  assert.equal((await actions.issuePasswordRecovery(crashTenant.tenant.id)).state, 'sent'); checks++
  assert.equal(deliveries.length - crashDeliveriesBefore, 2); checks++
  assert.equal(lastToken(), crashToken); checks++
  assert.equal(deliveries.at(-1).headers['Idempotency-Key'], crashKey); checks++
  assert.equal(await prisma.passwordResetToken.count({ where: { tenantId: crashTenant.tenant.id } }), 1); checks++
  assert.equal(await prisma.emailOutbox.count({ where: { aggregateType: 'PasswordResetToken', aggregateId: crashReset.id } }), 1); checks++

  relayOk = false
  const failedRecovery = await recover(request('/api/auth/password-recovery', { email: one.tenant.email }))
  assert.equal(failedRecovery.status, 202); checks++
  const recoveryBody = await bodyOf(failedRecovery)
  assert.deepEqual(Object.keys(recoveryBody).sort(), ['message', 'ok']); checks++
  const failedReset = await prisma.passwordResetToken.findFirst({ where: { tenantId: one.tenant.id }, orderBy: { createdAt: 'desc' } })
  assert.equal(failedReset.usedAt, null); checks++
  const failedRecoveryJob = await prisma.emailOutbox.findFirst({ where: { aggregateType: 'PasswordResetToken', aggregateId: failedReset.id } })
  ok(failedRecoveryJob && failedRecoveryJob.sentAt === null && failedRecoveryJob.attempts === 1, 'failed recovery remains pending without invalidating its credential')
  assert.match(failedRecoveryJob.payload, /^mobos-email-outbox:v1:test-v1:/); checks++
  ok(!failedRecoveryJob.payload.includes(lastToken()) && !failedRecoveryJob.payload.includes('restablecer-contrasena'), 'pending database payload contains neither the raw token nor the rendered action link')
  const failedRecoveryKey = failedRecoveryJob.idempotencyKey
  await prisma.emailOutbox.update({ where: { id: failedRecoveryJob.id }, data: { availableAt: new Date(Date.now() - 1_000) } })
  process.env.MOBOS_EMAIL_OUTBOX_ACTIVE_KEY_ID = 'test-v2'
  process.env.MOBOS_EMAIL_OUTBOX_ENCRYPTION_KEYS_JSON = JSON.stringify({ 'test-v1': Buffer.alloc(32, 7).toString('base64'), 'test-v2': Buffer.alloc(32, 8).toString('base64') })
  relayOk = true
  const retryDeliveriesBefore = deliveries.length
  assert.equal((await processOutbox(maintenanceRequest('wrong-token'))).status, 401); checks++
  const workerResponses = await Promise.all([processOutbox(maintenanceRequest(process.env.MOBOS_MAINTENANCE_TOKEN)), processOutbox(maintenanceRequest(process.env.MOBOS_MAINTENANCE_TOKEN))])
  assert.deepEqual(workerResponses.map(response => response.status), [200, 200]); checks++
  assert.equal(deliveries.length - retryDeliveriesBefore, 1); checks++
  ok((await Promise.all(workerResponses.map(bodyOf))).reduce((sum, result) => sum + result.sent, 0) === 1, 'concurrent outbox workers dispatch a retry once')
  const retriedRecoveryToken = lastToken()
  assert.equal(auth.hashToken(retriedRecoveryToken), failedReset.tokenHash); checks++
  const retriedJob = await prisma.emailOutbox.findUnique({ where: { id: failedRecoveryJob.id } })
  ok(retriedJob.sentAt instanceof Date && retriedJob.attempts === 1 && retriedJob.idempotencyKey === failedRecoveryKey, 'successful retry preserves the prior failure count and marks the same job sent')
  assert.equal(retriedJob.payload, ''); checks++
  assert.equal(retriedJob.recipient, ''); checks++
  const deliveriesBeforeSentReplay = deliveries.length
  assert.equal((await outbox.dispatchEmailOutboxJob(failedRecoveryJob.id)).state, 'already-sent'); checks++
  assert.equal(deliveries.length, deliveriesBeforeSentReplay); checks++

  relayOk = false
  assert.equal((await actions.issuePasswordRecovery(tamperTenant.tenant.id)).state, 'delivery-failed'); checks++
  const tamperReset = await prisma.passwordResetToken.findFirst({ where: { tenantId: tamperTenant.tenant.id, usedAt: null } })
  const tamperJob = await prisma.emailOutbox.findFirst({ where: { aggregateType: 'PasswordResetToken', aggregateId: tamperReset.id } })
  const tamperedPayloadParts = tamperJob.payload.split(':')
  const tamperedCiphertext = Buffer.from(tamperedPayloadParts[4], 'base64url')
  tamperedCiphertext[0] ^= 1
  tamperedPayloadParts[4] = tamperedCiphertext.toString('base64url')
  await prisma.emailOutbox.update({ where: { id: tamperJob.id }, data: { payload: tamperedPayloadParts.join(':'), availableAt: new Date(Date.now() - 1_000) } })
  relayOk = true
  const deliveriesBeforeTamper = deliveries.length
  assert.equal((await outbox.dispatchEmailOutboxJob(tamperJob.id)).state, 'failed'); checks++
  assert.equal(deliveries.length, deliveriesBeforeTamper); checks++
  const rejectedTamper = await prisma.emailOutbox.findUnique({ where: { id: tamperJob.id } })
  ok(rejectedTamper.failedAt instanceof Date && rejectedTamper.payload === '' && rejectedTamper.recipient === '', 'authenticated payload tampering fails closed and scrubs the dead letter')

  relayOk = false
  assert.equal((await actions.issuePasswordRecovery(recipientTamperTenant.tenant.id)).state, 'delivery-failed'); checks++
  const recipientTamperReset = await prisma.passwordResetToken.findFirst({ where: { tenantId: recipientTamperTenant.tenant.id, usedAt: null } })
  const recipientTamperJob = await prisma.emailOutbox.findFirst({ where: { aggregateType: 'PasswordResetToken', aggregateId: recipientTamperReset.id } })
  await prisma.emailOutbox.update({ where: { id: recipientTamperJob.id }, data: { recipient: 'rerouted@example.test', availableAt: new Date(Date.now() - 1_000) } })
  relayOk = true
  const deliveriesBeforeRecipientTamper = deliveries.length
  assert.equal((await outbox.dispatchEmailOutboxJob(recipientTamperJob.id)).state, 'failed'); checks++
  assert.equal(deliveries.length, deliveriesBeforeRecipientTamper); checks++
  const rejectedRecipientTamper = await prisma.emailOutbox.findUnique({ where: { id: recipientTamperJob.id } })
  ok(rejectedRecipientTamper.failedAt instanceof Date && rejectedRecipientTamper.payload === '' && rejectedRecipientTamper.recipient === '', 'changing only the stored recipient fails authenticated decryption before relay invocation')

  relayOk = false
  assert.equal((await actions.issuePasswordRecovery(deadLetterTenant.tenant.id)).state, 'delivery-failed'); checks++
  const deadLetterToken = lastToken()
  const deadLetterReset = await prisma.passwordResetToken.findFirst({ where: { tenantId: deadLetterTenant.tenant.id, usedAt: null } })
  const deadLetterJob = await prisma.emailOutbox.findFirst({ where: { aggregateType: 'PasswordResetToken', aggregateId: deadLetterReset.id } })
  for (let attempt = 2; attempt <= outbox.EMAIL_OUTBOX_MAX_ATTEMPTS; attempt++) {
    await prisma.emailOutbox.update({ where: { id: deadLetterJob.id }, data: { availableAt: new Date(Date.now() - 1_000) } })
    const beforeAttempt = Date.now()
    const result = await outbox.dispatchEmailOutboxJob(deadLetterJob.id)
    assert.equal(result.state, attempt === outbox.EMAIL_OUTBOX_MAX_ATTEMPTS ? 'failed' : 'retryable'); checks++
    const row = await prisma.emailOutbox.findUnique({ where: { id: deadLetterJob.id } })
    if (attempt < outbox.EMAIL_OUTBOX_MAX_ATTEMPTS) {
      const expected = Math.min(outbox.EMAIL_OUTBOX_RETRY_BASE_MS * (2 ** (attempt - 1)), outbox.EMAIL_OUTBOX_RETRY_MAX_MS)
      ok(row.availableAt.getTime() >= beforeAttempt + expected - 100 && row.availableAt.getTime() <= Date.now() + expected + 100, `attempt ${attempt} uses bounded exponential backoff`)
    }
  }
  const terminalJob = await prisma.emailOutbox.findUnique({ where: { id: deadLetterJob.id } })
  ok(terminalJob.failedAt instanceof Date && terminalJob.attempts === outbox.EMAIL_OUTBOX_MAX_ATTEMPTS, 'retry exhaustion creates a terminal dead-letter state')
  assert.equal(terminalJob.payload, ''); checks++
  assert.equal(terminalJob.recipient, ''); checks++
  const deliveriesBeforeDeadReplay = deliveries.length
  assert.equal((await outbox.dispatchEmailOutboxJob(deadLetterJob.id)).state, 'failed'); checks++
  assert.equal(deliveries.length, deliveriesBeforeDeadReplay); checks++
  const deadLetterAudit = await prisma.auditLog.findFirst({ where: { tenantId: deadLetterTenant.tenant.id, action: 'PASSWORD_RECOVERY_DELIVERY_FAILED_DEAD_LETTERED' } })
  ok(deadLetterAudit && !JSON.stringify(deadLetterAudit).includes(deadLetterToken) && !JSON.stringify(deadLetterAudit).includes(deadLetterTenant.tenant.email), 'dead-letter audit contains operational metadata without credential or PII')
  relayOk = true

  const recoveryDeliveriesBefore = deliveries.length
  const recoveryResponses = await Promise.all([
    recover(request('/api/auth/password-recovery', { email: two.tenant.email })),
    recover(request('/api/auth/password-recovery', { email: two.tenant.email })),
  ])
  assert.deepEqual(recoveryResponses.map(response => response.status), [202, 202]); checks++
  assert.equal(deliveries.length - recoveryDeliveriesBefore, 1); checks++
  const concurrentRecoveryToken = lastToken()
  const survivingRecovery = await prisma.passwordResetToken.findFirst({ where: { tenantId: two.tenant.id, usedAt: null } })
  assert.equal(await prisma.passwordResetToken.count({ where: { tenantId: two.tenant.id, usedAt: null } }), 1); checks++
  assert.equal(survivingRecovery.tokenHash, auth.hashToken(concurrentRecoveryToken)); checks++

  const unknownStartedAt = Date.now()
  const unknownRecovery = await recover(request('/api/auth/password-recovery', { email: 'missing@example.test' }))
  const unknownElapsed = Date.now() - unknownStartedAt
  const knownStartedAt = Date.now()
  const knownRecovery = await recover(request('/api/auth/password-recovery', { email: two.tenant.email }))
  const knownElapsed = Date.now() - knownStartedAt
  assert.deepEqual(await bodyOf(unknownRecovery), await bodyOf(knownRecovery)); checks++
  ok(unknownElapsed >= 450 && knownElapsed >= 450, 'public recovery enforces the same bounded response floor')

  relayOk = false
  const issued = await actions.issueEmailVerification(one.tenant.id)
  assert.equal(issued.state, 'delivery-failed'); checks++
  const verificationToken = lastToken()
  assert.match(verificationToken, /^[a-f0-9]{64}$/); checks++
  const storedVerification = await prisma.emailVerificationToken.findFirst({ where: { tenantId: one.tenant.id, revokedAt: null } })
  assert.equal(storedVerification.tokenHash, auth.hashToken(`EMAIL_VERIFICATION:${verificationToken}`)); checks++
  assert.notEqual(storedVerification.tokenHash, verificationToken); checks++
  const pendingVerificationJob = await prisma.emailOutbox.findFirst({ where: { aggregateType: 'EmailVerificationToken', aggregateId: storedVerification.id } })
  assert.equal(pendingVerificationJob.sentAt, null); checks++
  relayOk = true
  const verificationDeliveriesDuringBackoff = deliveries.length
  assert.equal((await actions.issueEmailVerification(one.tenant.id)).state, 'already-issued'); checks++
  assert.equal(deliveries.length, verificationDeliveriesDuringBackoff); checks++
  assert.equal((await prisma.emailOutbox.findUnique({ where: { id: pendingVerificationJob.id } })).attempts, 1); checks++
  await prisma.emailOutbox.update({ where: { id: pendingVerificationJob.id }, data: { availableAt: new Date(Date.now() - 1_000) } })
  assert.equal((await actions.issueEmailVerification(one.tenant.id)).state, 'sent'); checks++
  assert.equal(lastToken(), verificationToken); checks++
  assert.equal((await prisma.emailOutbox.findUnique({ where: { id: pendingVerificationJob.id } })).attempts, 1); checks++
  const tokenCount = await prisma.emailVerificationToken.count({ where: { tenantId: one.tenant.id, revokedAt: null } })
  const cooldown = await resendVerification(request('/api/auth/email-verification/resend', { email: one.tenant.email }))
  assert.equal(cooldown.status, 202); checks++
  assert.equal(await prisma.emailVerificationToken.count({ where: { tenantId: one.tenant.id, revokedAt: null } }), tokenCount); checks++
  await prisma.emailVerificationToken.update({ where: { id: storedVerification.id }, data: { sentAt: new Date(Date.now() - actions.EMAIL_VERIFICATION_COOLDOWN_MS - 1_000) } })
  const replacementDeliveriesBefore = deliveries.length
  assert.equal((await resendVerification(request('/api/auth/email-verification/resend', { email: one.tenant.email }))).status, 202); checks++
  assert.equal(deliveries.length - replacementDeliveriesBefore, 1); checks++
  const replacementVerificationToken = lastToken()
  assert.notEqual(replacementVerificationToken, verificationToken); checks++
  assert.equal((await prisma.emailVerificationToken.findUnique({ where: { id: storedVerification.id } })).revokedAt instanceof Date, true); checks++
  assert.equal(await prisma.emailVerificationToken.count({ where: { tenantId: one.tenant.id, consumedAt: null, revokedAt: null } }), 1); checks++
  assert.equal((await verify(request('/api/auth/email-verification/verify', { token: 'bad' }))).status, 400); checks++
  assert.equal((await verify(request('/api/auth/email-verification/verify', { token: verificationToken }))).status, 400); checks++
  const verified = await verify(request('/api/auth/email-verification/verify', { token: replacementVerificationToken }))
  assert.equal(verified.status, 200); checks++
  ok((await prisma.tenant.findUnique({ where: { id: one.tenant.id } })).emailVerifiedAt instanceof Date, 'verification persists timestamp')
  assert.equal((await verify(request('/api/auth/email-verification/verify', { token: replacementVerificationToken }))).status, 400); checks++
  const expiredToken = 'ab'.repeat(32)
  await prisma.emailVerificationToken.create({ data: { tenantId: two.tenant.id, purpose: 'EMAIL_VERIFICATION', tokenHash: auth.hashToken(`EMAIL_VERIFICATION:${expiredToken}`), sentAt: new Date(Date.now() - 7200_000), expiresAt: new Date(Date.now() - 3600_000) } })
  assert.equal((await verify(request('/api/auth/email-verification/verify', { token: expiredToken }))).status, 400); checks++
  const verificationDeliveriesBefore = deliveries.length
  const concurrentVerification = await Promise.all([actions.issueEmailVerification(two.tenant.id), actions.issueEmailVerification(two.tenant.id)])
  assert.deepEqual(concurrentVerification.map(result => result.state).sort(), ['already-issued', 'sent']); checks++
  assert.equal(deliveries.length - verificationDeliveriesBefore, 1); checks++
  const concurrentVerificationToken = lastToken()
  const survivingVerification = await prisma.emailVerificationToken.findFirst({ where: { tenantId: two.tenant.id, consumedAt: null, revokedAt: null } })
  assert.equal(await prisma.emailVerificationToken.count({ where: { tenantId: two.tenant.id, consumedAt: null, revokedAt: null } }), 1); checks++
  assert.equal(survivingVerification.tokenHash, auth.hashToken(`EMAIL_VERIFICATION:${concurrentVerificationToken}`)); checks++
  assert.equal((await verify(request('/api/auth/email-verification/verify', { token: concurrentVerificationToken }))).status, 200); checks++
  assert.equal((await verify(request('/api/auth/email-verification/verify', { token: concurrentVerificationToken }))).status, 400); checks++

  const unknownVerificationStartedAt = Date.now()
  const unknownVerification = await resendVerification(request('/api/auth/email-verification/resend', { email: 'missing@example.test' }))
  const unknownVerificationElapsed = Date.now() - unknownVerificationStartedAt
  const knownVerificationStartedAt = Date.now()
  const knownVerification = await resendVerification(request('/api/auth/email-verification/resend', { email: two.tenant.email }))
  const knownVerificationElapsed = Date.now() - knownVerificationStartedAt
  assert.deepEqual(await bodyOf(unknownVerification), await bodyOf(knownVerification)); checks++
  ok(unknownVerificationElapsed >= 450 && knownVerificationElapsed >= 450, 'verification resend enforces the same bounded response floor')

  const direct = await users.POST(request('/api/users', { name: 'Direct User', email: 'direct@example.test', role: 'VENDEDOR', pin: '1234' }, one.bearer))
  assert.equal(direct.status, 201); checks++
  ok(!!await prisma.user.findUnique({ where: { tenantId_email: { tenantId: one.tenant.id, email: 'direct@example.test' } } }), 'direct PIN creation remains available')

  const createInvite = async (email, bearer = one.bearer) => invitations.POST(request('/api/user-invitations', { name: 'Invited User', email, role: 'VENDEDOR' }, bearer))
  const createdResponse = await createInvite('invite@example.test')
  assert.equal(createdResponse.status, 201); checks++
  const created = await bodyOf(createdResponse)
  const inviteToken = lastToken()
  assert.equal(created.status, 'PENDING'); checks++
  const storedInvite = await prisma.userInvitation.findUnique({ where: { id: created.id } })
  assert.equal(storedInvite.tokenHash, auth.hashToken(`USER_INVITATION:${inviteToken}`)); checks++
  assert.equal((await createInvite('invite@example.test')).status, 409); checks++
  const listOne = await bodyOf(await invitations.GET(get('/api/user-invitations', one.bearer)))
  const listTwo = await bodyOf(await invitations.GET(get('/api/user-invitations', two.bearer)))
  assert.equal(listOne.length, 1); checks++
  assert.equal(listTwo.length, 0); checks++
  assert.equal((await resendInvitation(request('/api/user-invitations/x/resend', {}, one.bearer), { params: { id: created.id } })).status, 429); checks++
  assert.equal((await resendInvitation(request('/api/user-invitations/x/resend', {}, two.bearer), { params: { id: created.id } })).status, 404); checks++
  assert.equal((await revokeInvitation(request('/api/user-invitations/x/revoke', {}, two.bearer), { params: { id: created.id } })).status, 404); checks++
  await prisma.userInvitation.update({ where: { id: created.id }, data: { resendAvailableAt: new Date(Date.now() - 1000) } })
  const preResend = await prisma.userInvitation.findUnique({ where: { id: created.id } })
  const preResendJobs = await prisma.emailOutbox.count({ where: { aggregateType: 'UserInvitation', aggregateId: created.id } })
  const preResendDeliveries = deliveries.length
  assert.equal((await withCommitFailure('invitation-resend', () => resendInvitation(request('/api/user-invitations/x/resend', {}, one.bearer), { params: { id: created.id } }))).status, 409); checks++
  assert.equal((await prisma.userInvitation.findUnique({ where: { id: created.id } })).tokenHash, preResend.tokenHash); checks++
  assert.equal(await prisma.emailOutbox.count({ where: { aggregateType: 'UserInvitation', aggregateId: created.id } }), preResendJobs); checks++
  assert.equal(deliveries.length, preResendDeliveries); checks++
  assert.equal((await resendInvitation(request('/api/user-invitations/x/resend', {}, one.bearer), { params: { id: created.id } })).status, 200); checks++
  const resentInviteToken = lastToken()
  assert.notEqual(resentInviteToken, inviteToken); checks++
  assert.equal((await acceptInvitation(request('/api/user-invitations/accept', { token: inviteToken, pin: '2468', deviceId: 'old-link-device' }))).status, 400); checks++
  assert.equal((await acceptInvitation(request('/api/user-invitations/accept', { token: 'broken', pin: '1234', deviceId: 'bad-link-device' }))).status, 400); checks++
  const concurrent = await Promise.all([
    acceptInvitation(request('/api/user-invitations/accept', { token: resentInviteToken, pin: '2468', deviceId: 'fresh-device-a' })),
    acceptInvitation(request('/api/user-invitations/accept', { token: resentInviteToken, pin: '2468', deviceId: 'fresh-device-b' })),
  ])
  assert.deepEqual(concurrent.map(response => response.status).sort(), [201, 400]); checks++
  const acceptedResponse = concurrent.find(response => response.status === 201)
  const sellerCookie = acceptedResponse.cookies.get('mobos_seller_session').value
  ok(Boolean(sellerCookie) && acceptedResponse.headers.get('set-cookie').includes('HttpOnly'), 'fresh-device acceptance establishes an HttpOnly seller session')
  const acceptedSession = await auth.requireSession(new Request('https://api.example.test/api/auth/me', { headers: { Cookie: `mobos_seller_session=${sellerCookie}`, Origin: 'https://app.example.test' } }))
  ok(acceptedSession?.user.email === undefined && acceptedSession?.user.tenantId === one.tenant.id, 'fresh-device invite session is tenant-bound and immediately usable')
  assert.equal(await prisma.user.count({ where: { tenantId: one.tenant.id, email: 'invite@example.test' } }), 1); checks++
  assert.equal((await acceptInvitation(request('/api/user-invitations/accept', { token: resentInviteToken, pin: '2468', deviceId: 'fresh-device-c' }))).status, 400); checks++

  relayOk = false
  const queuedInviteResponse = await createInvite('queued-invite@example.test')
  assert.equal(queuedInviteResponse.status, 201); checks++
  const queuedInvite = await bodyOf(queuedInviteResponse)
  assert.equal(queuedInvite.deliveryState, 'queued'); checks++
  const queuedInviteRow = await prisma.userInvitation.findUnique({ where: { id: queuedInvite.id } })
  assert.equal(queuedInviteRow.revokedAt, null); checks++
  const queuedInviteJob = await prisma.emailOutbox.findFirst({ where: { aggregateType: 'UserInvitation', aggregateId: queuedInvite.id, sentAt: null } })
  await prisma.emailOutbox.update({ where: { id: queuedInviteJob.id }, data: { availableAt: new Date(Date.now() - 1_000) } })
  relayOk = true
  const queuedInviteRetry = await resendInvitation(request('/api/user-invitations/x/resend', {}, one.bearer), { params: { id: queuedInvite.id } })
  assert.equal(queuedInviteRetry.status, 200); checks++
  assert.equal((await bodyOf(queuedInviteRetry)).deliveryState, 'sent'); checks++
  const queuedInviteToken = lastToken()
  assert.equal(auth.hashToken(`USER_INVITATION:${queuedInviteToken}`), queuedInviteRow.tokenHash); checks++
  assert.equal((await acceptInvitation(request('/api/user-invitations/accept', { token: queuedInviteToken, pin: '6420', deviceId: 'queued-invite-device' }))).status, 201); checks++

  const expiredInviteToken = 'cd'.repeat(32)
  await prisma.userInvitation.create({ data: { tenantId: two.tenant.id, email: 'expired@example.test', name: 'Expired', role: 'VENDEDOR', inviterId: two.admin.id, tokenHash: auth.hashToken(`USER_INVITATION:${expiredInviteToken}`), sentAt: new Date(Date.now() - 9 * 86400_000), resendAvailableAt: new Date(Date.now() - 8 * 86400_000), expiresAt: new Date(Date.now() - 86400_000) } })
  assert.equal((await acceptInvitation(request('/api/user-invitations/accept', { token: expiredInviteToken, pin: '2468', deviceId: 'expired-device' }))).status, 400); checks++

  const raceResponse = await createInvite('race@example.test')
  const raceInvitation = await bodyOf(raceResponse)
  const raceToken = lastToken()
  await prisma.userInvitation.update({ where: { id: raceInvitation.id }, data: { resendAvailableAt: new Date(Date.now() - 1000) } })
  const transitions = await Promise.all([
    resendInvitation(request('/api/user-invitations/x/resend', {}, one.bearer), { params: { id: raceInvitation.id } }),
    revokeInvitation(request('/api/user-invitations/x/revoke', {}, one.bearer), { params: { id: raceInvitation.id } }),
    acceptInvitation(request('/api/user-invitations/accept', { token: raceToken, pin: '8642', deviceId: 'race-device' })),
  ])
  assert.equal(transitions.filter(response => response.status >= 200 && response.status < 300).length, 1); checks++
  const raceRow = await prisma.userInvitation.findUnique({ where: { id: raceInvitation.id } })
  ok(raceRow.tokenHash !== auth.hashToken(`USER_INVITATION:${raceToken}`) || Boolean(raceRow.consumedAt) !== Boolean(raceRow.revokedAt), 'concurrent resend/revoke/accept persists only the winning transition')

  const resendRaceResponse = await createInvite('resend-race@example.test')
  const resendRaceInvitation = await bodyOf(resendRaceResponse)
  await prisma.userInvitation.update({ where: { id: resendRaceInvitation.id }, data: { resendAvailableAt: new Date(Date.now() - 1000) } })
  const resendRaceDeliveriesBefore = deliveries.length
  const resendRace = await Promise.all([
    resendInvitation(request('/api/user-invitations/x/resend', {}, one.bearer), { params: { id: resendRaceInvitation.id } }),
    resendInvitation(request('/api/user-invitations/x/resend', {}, one.bearer), { params: { id: resendRaceInvitation.id } }),
  ])
  const resendRaceStatuses = resendRace.map(response => response.status).sort()
  ok(resendRaceStatuses[0] === 200 && [200, 409, 429].includes(resendRaceStatuses[1]), 'concurrent resends share one durable delivery or reject the stale request')
  assert.equal(deliveries.length - resendRaceDeliveriesBefore, 1); checks++
  const winningResendToken = lastToken()
  assert.equal((await acceptInvitation(request('/api/user-invitations/accept', { token: winningResendToken, pin: '9753', deviceId: 'resend-race-device' }))).status, 201); checks++

  const revokeResponse = await createInvite('revoke@example.test')
  const revokeRow = await bodyOf(revokeResponse)
  assert.equal((await revokeInvitation(request('/api/user-invitations/x/revoke', {}, one.bearer), { params: { id: revokeRow.id } })).status, 200); checks++
  const revokedToken = lastToken()
  assert.equal((await acceptInvitation(request('/api/user-invitations/accept', { token: revokedToken, pin: '1357', deviceId: 'revoked-device' }))).status, 400); checks++

  assert.equal((await resetPassword(request('/api/auth/password-reset', { token: concurrentRecoveryToken, password: 'replacement-password' }))).status, 200); checks++
  assert.equal((await resetPassword(request('/api/auth/password-reset', { token: concurrentRecoveryToken, password: 'replacement-password' }))).status, 400); checks++

  const previousNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  const canonicalWelcome = email.welcomeEmail({ to: 'canonical-link@example.test', companyName: 'Canonical', tenantId: 'canonical-test' })
  process.env.NODE_ENV = previousNodeEnv
  ok(canonicalWelcome.text.includes('https://app.moboss.online/login'), 'production templates use the absolute canonical MobOS app origin')
  const sensitiveValues = [one.tenant.email, two.tenant.email, crashToken, retriedRecoveryToken, concurrentRecoveryToken, verificationToken, replacementVerificationToken, concurrentVerificationToken, deadLetterToken, inviteToken, resentInviteToken]
  ok(logs.every(line => sensitiveValues.every(value => !line.includes(value))), 'delivery outcome logs contain no email or token')
  ok(deliveries.every(item => item.payload.project === 'mobos' && item.payload.html && item.payload.text && item.headers['Idempotency-Key']), 'all templates use MobOS relay with HTML, text, and idempotency keys')
  ok(deliveries.every(item => /^mobos-outbox-[0-9a-f-]{36}$/i.test(item.headers['Idempotency-Key'])), 'provider idempotency keys derive only from durable outbox UUIDs under an at-least-once relay contract')
  ok(deliveries.every(item => !sensitiveValues.some(value => item.headers['Idempotency-Key'].includes(value.slice(0, 16)))), 'provider idempotency keys contain no credential prefix')
  ok(deliveries.filter(item => /(?:aceptar-invitacion|verificar-correo|restablecer-contrasena)/.test(item.payload.text)).every(item => item.payload.text.includes('#token=') && !item.payload.text.includes('?token=')), 'credential links use fragments and never query parameters')
  const auditActions = new Set((await prisma.auditLog.findMany({ where: { tenantId: one.tenant.id }, select: { action: true } })).map(row => row.action))
  for (const action of ['PASSWORD_RECOVERY_DELIVERY_FAILED', 'EMAIL_VERIFICATION_ISSUED', 'EMAIL_VERIFIED', 'USER_INVITATION_CREATED', 'USER_INVITATION_RESENT', 'USER_INVITATION_ACCEPTED', 'USER_INVITATION_REVOKED']) ok(auditActions.has(action), `${action} is audited`)
  originalInfo(`Email and invitations: ${checks} checks OK (disposable PostgreSQL; mocked relay).`)
} finally {
  globalThis.fetch = originalFetch
  console.info = originalInfo
  if (prisma) await prisma.$disconnect()
  if (started) run('pg_ctl', ['-D', pgdata, '-m', 'fast', '-w', 'stop'])
  rmSync(root, { recursive: true, force: true })
}
