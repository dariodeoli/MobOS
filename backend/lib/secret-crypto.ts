import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// Cifrado de secretos operativos (por ejemplo, el código de desbloqueo que el
// cliente entrega con el equipo). Reusa el llavero ya configurado para la
// bandeja de correo: una sola configuración de entorno para todo lo cifrado, y
// el AAD ata cada secreto a su fila (no se puede mover un ciphertext a otra).

const FORMAT = 'mobos-secret'
const VERSION = 'v1'
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,48}$/

type KeyRing = { activeKeyId: string; keys: Map<string, Buffer> }
type Uso = { uso: string; referencia: string }

function configuredKeyRing(): KeyRing {
  const activeKeyId = process.env.MOBOS_EMAIL_OUTBOX_ACTIVE_KEY_ID || ''
  let configured: unknown
  try {
    configured = JSON.parse(process.env.MOBOS_EMAIL_OUTBOX_ENCRYPTION_KEYS_JSON || '')
  } catch {
    throw new Error('SECRET_ENCRYPTION_NOT_CONFIGURED')
  }
  if (!KEY_ID_PATTERN.test(activeKeyId) || !configured || typeof configured !== 'object' || Array.isArray(configured)) {
    throw new Error('SECRET_ENCRYPTION_NOT_CONFIGURED')
  }
  const keys = new Map<string, Buffer>()
  for (const [keyId, encoded] of Object.entries(configured)) {
    if (!KEY_ID_PATTERN.test(keyId) || typeof encoded !== 'string') continue
    const key = Buffer.from(encoded, 'base64')
    if (key.length === 32) keys.set(keyId, key)
  }
  if (!keys.has(activeKeyId)) throw new Error('SECRET_ENCRYPTION_NOT_CONFIGURED')
  return { activeKeyId, keys }
}

export function secretEncryptionConfigured() {
  try {
    configuredKeyRing()
    return true
  } catch {
    return false
  }
}

const aad = ({ uso, referencia }: Uso) => Buffer.from(JSON.stringify([FORMAT, VERSION, uso, referencia]), 'utf8')

export function cifrarSecreto(valor: unknown, uso: Uso) {
  const { activeKeyId, keys } = configuredKeyRing()
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keys.get(activeKeyId)!, nonce)
  cipher.setAAD(aad(uso))
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(valor), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [FORMAT, VERSION, activeKeyId, nonce.toString('base64url'), ciphertext.toString('base64url'), tag.toString('base64url')].join(':')
}

export function descifrarSecreto(payload: string, uso: Uso): unknown {
  const parts = String(payload).split(':')
  if (parts.length !== 6 || parts[0] !== FORMAT || parts[1] !== VERSION || !KEY_ID_PATTERN.test(parts[2])) {
    throw new Error('SECRET_PAYLOAD_INVALID')
  }
  const key = configuredKeyRing().keys.get(parts[2])
  if (!key) throw new Error('SECRET_KEY_UNAVAILABLE')
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parts[3], 'base64url'))
    decipher.setAAD(aad(uso))
    decipher.setAuthTag(Buffer.from(parts[5], 'base64url'))
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(parts[4], 'base64url')), decipher.final()]).toString('utf8'))
  } catch {
    throw new Error('SECRET_PAYLOAD_INVALID')
  }
}

// Roles que pueden ver el código de desbloqueo: quien recibe y quien repara.
export const ROLES_CON_DESBLOQUEO = ['ADMIN', 'GERENTE', 'TECNICO']
