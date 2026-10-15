import { randomBytes } from 'node:crypto'
import { prisma } from './prisma'
import { hashToken } from './auth'

// Nonce de un solo uso emitido por el servidor (docs/TOKENS.md): 64 hex, solo
// sha256 en la base, TTL de 5 min con el reloj de Postgres y consumo atómico.
// Apple/Google nativos y la reautenticación de borrado lo presentan: sin él, un
// identityToken robado se podría reutilizar.
export type NoncePurpose = 'login' | 'reauth'
export const NONCE_PATTERN = /^[a-f0-9]{64}$/
export const NONCE_TTL_SECONDS = 300

export async function issueAuthNonce(purpose: NoncePurpose) {
  const nonce = randomBytes(32).toString('hex')
  // Limpieza oportunista de vencidos (los vivos no se tocan).
  await prisma.$executeRaw`DELETE FROM "AuthNonce" WHERE "expiresAt" < now() - interval '1 hour'`
  await prisma.$executeRaw`INSERT INTO "AuthNonce" ("id", "tokenHash", "purpose", "expiresAt") VALUES (${randomBytes(12).toString('hex')}, ${hashToken(nonce)}, ${purpose}, now() + interval '5 minutes')`
  return { nonce, expiresInSeconds: NONCE_TTL_SECONDS }
}

/** Consume el nonce una sola vez (DELETE ... RETURNING). false = inexistente, vencido, ya usado o de otro propósito. */
export async function consumeAuthNonce(nonce: unknown, purpose: NoncePurpose) {
  if (typeof nonce !== 'string' || !NONCE_PATTERN.test(nonce)) return false
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`DELETE FROM "AuthNonce" WHERE "tokenHash" = ${hashToken(nonce)} AND "purpose" = ${purpose} AND "expiresAt" > now() RETURNING "id"`
  return rows.length === 1
}
