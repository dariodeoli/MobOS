import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const FORMAT = 'mobos-email-outbox'
const VERSION = 'v1'
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,48}$/

type KeyRing = { activeKeyId: string; keys: Map<string, Buffer> }
type Binding = { id: string; tenantId: string; kind: string; recipient: string; aggregateType: string; aggregateId: string; idempotencyKey: string }

function configuredKeyRing(): KeyRing {
  const activeKeyId = process.env.MOBOS_EMAIL_OUTBOX_ACTIVE_KEY_ID || ''
  let configured: unknown
  try {
    configured = JSON.parse(process.env.MOBOS_EMAIL_OUTBOX_ENCRYPTION_KEYS_JSON || '')
  } catch {
    throw new Error('EMAIL_OUTBOX_ENCRYPTION_NOT_CONFIGURED')
  }
  if (!KEY_ID_PATTERN.test(activeKeyId) || !configured || typeof configured !== 'object' || Array.isArray(configured)) {
    throw new Error('EMAIL_OUTBOX_ENCRYPTION_NOT_CONFIGURED')
  }
  const keys = new Map<string, Buffer>()
  for (const [keyId, encoded] of Object.entries(configured)) {
    if (!KEY_ID_PATTERN.test(keyId) || typeof encoded !== 'string') continue
    const key = Buffer.from(encoded, 'base64')
    if (key.length === 32) keys.set(keyId, key)
  }
  if (!keys.has(activeKeyId)) throw new Error('EMAIL_OUTBOX_ENCRYPTION_NOT_CONFIGURED')
  return { activeKeyId, keys }
}

export function emailOutboxEncryptionConfigured() {
  try {
    configuredKeyRing()
    return true
  } catch {
    return false
  }
}

function aad(binding: Binding) {
  return Buffer.from(JSON.stringify([FORMAT, VERSION, binding.id, binding.tenantId, binding.kind, binding.recipient, binding.aggregateType, binding.aggregateId, binding.idempotencyKey]), 'utf8')
}

export function encryptEmailOutboxPayload(payload: unknown, binding: Binding) {
  const { activeKeyId, keys } = configuredKeyRing()
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keys.get(activeKeyId)!, nonce)
  cipher.setAAD(aad(binding))
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [FORMAT, VERSION, activeKeyId, nonce.toString('base64url'), ciphertext.toString('base64url'), tag.toString('base64url')].join(':')
}

export function decryptEmailOutboxPayload(payload: string, binding: Binding): unknown {
  const parts = payload.split(':')
  if (parts.length !== 6 || parts[0] !== FORMAT || parts[1] !== VERSION || !KEY_ID_PATTERN.test(parts[2])) {
    throw new Error('EMAIL_OUTBOX_PAYLOAD_INVALID')
  }
  const key = configuredKeyRing().keys.get(parts[2])
  if (!key) throw new Error('EMAIL_OUTBOX_KEY_UNAVAILABLE')
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parts[3], 'base64url'))
    decipher.setAAD(aad(binding))
    decipher.setAuthTag(Buffer.from(parts[5], 'base64url'))
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(parts[4], 'base64url')), decipher.final()]).toString('utf8'))
  } catch {
    throw new Error('EMAIL_OUTBOX_PAYLOAD_INVALID')
  }
}
