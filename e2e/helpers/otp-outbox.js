// A3 (#279): lee el código OTP de la outbox real del arnés e2e y lo descifra
// con la misma sobre (AES-256-GCM + AAD) que usa el backend. Es solo para
// tests: en la app el código nunca vuelve al navegador.
import { execFileSync } from 'node:child_process'
import { createDecipheriv } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

const FORMATO = 'mobos-email-outbox'
const VERSION = 'v1'
const PG_BIN = '/opt/homebrew/bin'

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  if (existsSync('backend/.env')) {
    const linea = readFileSync('backend/.env', 'utf8').split('\n').find((fila) => fila.startsWith('DATABASE_URL='))
    if (linea) return linea.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '')
  }
  const port = process.env.MOBOS_E2E_PGPORT || '5439'
  const db = process.env.MOBOS_E2E_DB || 'mobos_e2e'
  return `postgresql://postgres@127.0.0.1:${port}/${db}`
}

const sqlLiteral = (valor) => `'${String(valor).replace(/'/g, "''")}'`

function psql(sql) {
  return execFileSync(`${PG_BIN}/psql`, ['-X', '-A', '-t', '-c', sql, databaseUrl()], { encoding: 'utf8' }).trim()
}

function aad(job) {
  return Buffer.from(JSON.stringify([FORMATO, VERSION, job.id, job.tenantId, job.kind, job.recipient, job.aggregateType, job.aggregateId, job.idempotencyKey]), 'utf8')
}

function descifrar(job) {
  const partes = String(job.payload).split(':')
  if (partes.length !== 6 || partes[0] !== FORMATO || partes[1] !== VERSION) throw new Error('payload de outbox inválido')
  const llaves = JSON.parse(process.env.MOBOS_EMAIL_OUTBOX_ENCRYPTION_KEYS_JSON || '{}')
  const clave = Buffer.from(llaves[partes[2]] || '', 'base64')
  if (clave.length !== 32) throw new Error('clave de outbox ausente en el entorno de la spec')
  const decipher = createDecipheriv('aes-256-gcm', clave, Buffer.from(partes[3], 'base64url'))
  decipher.setAAD(aad(job))
  decipher.setAuthTag(Buffer.from(partes[5], 'base64url'))
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(partes[4], 'base64url')), decipher.final()]).toString('utf8'))
}

/**
 * Código del último correo OTP de la cotización. Espera a que la outbox tenga
 * la fila (el envío se encola dentro del request) y descifra el mensaje.
 */
export async function codigoOtpDeCotizacion(quoteId, { intentos = 20, esperaMs = 400 } = {}) {
  if (!/^[a-z0-9]+$/.test(String(quoteId))) throw new Error('id de cotización inválido')
  for (let intento = 0; intento < intentos; intento += 1) {
    const fila = psql(`SELECT row_to_json(t) FROM (SELECT "id","tenantId","kind","recipient","aggregateType","aggregateId","idempotencyKey",payload FROM "EmailOutbox" WHERE "aggregateId" = ${sqlLiteral(quoteId)} AND "kind" = 'quote-approval-otp' ORDER BY "createdAt" DESC LIMIT 1) t`)
    if (fila) {
      const mensaje = descifrar(JSON.parse(fila))
      const match = String(mensaje.text || '').match(/Código:\s*(\d{6})/)
      if (match) return match[1]
    }
    await new Promise((resolve) => setTimeout(resolve, esperaMs))
  }
  throw new Error('No apareció el código OTP en la outbox del arnés.')
}
