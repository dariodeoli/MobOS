import { isIP } from 'node:net'
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { hashToken, trustedClientIp } from './auth'
import { DemoEmailError, demoEmailQuotaKey } from './demo-email'

// Cuota de los correos de la demo, en Postgres como la del RUC
// (`ruc-demo-quota.ts`): reutiliza `AuthAttempt` (scope + huella hasheada), así
// que no necesita tabla ni migración. Tres ventanas de 24 h que se reservan
// juntas y en orden fijo antes de enviar: por correo destino, por red y global.
const DAY = 86_400_000
export const DEMO_EMAIL_SCOPES = { global: 'demo-email:global', network: 'demo-email:network', recipient: 'demo-email:recipient' } as const
export const DEMO_EMAIL_DEFAULT_LIMITS = { global: 200, network: 10, recipient: 5 } as const
type Store = Pick<Prisma.TransactionClient, 'authAttempt' | '$queryRaw' | '$executeRaw'>
export type DemoEmailQuotaDb = { $transaction: <T>(fn: (tx: Store) => Promise<T>, options?: { maxWait: number; timeout: number }) => Promise<T> }

function limit(value: string | undefined, maximum: number) {
  if (value === undefined) return maximum
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > maximum) {
    throw new DemoEmailError('demo_quota_not_configured', 'El envío de correos de la demo no está disponible.', 503)
  }
  return Number(value)
}

/** Misma canonicalización que la cuota del RUC: IP validada del proxy confiable; desconocidos comparten cupo. */
export function demoEmailNetworkFingerprint(request: Request) {
  const ip = trustedClientIp(request)
  let canonical = 'untrusted-network'
  if (ip && isIP(ip)) {
    canonical = isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname.slice(1, -1).toLowerCase() : ip
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical)
    if (mapped) {
      const bits = Number.parseInt(mapped[1], 16) * 65536 + Number.parseInt(mapped[2], 16)
      canonical = [bits >>> 24, (bits >>> 16) & 255, (bits >>> 8) & 255, bits & 255].join('.')
    }
  }
  return hashToken(`${DEMO_EMAIL_SCOPES.network}:${canonical}`)
}

export function demoEmailRecipientFingerprint(address: string) {
  return hashToken(`${DEMO_EMAIL_SCOPES.recipient}:${demoEmailQuotaKey(address)}`)
}

/** Reserva los tres presupuestos. Sin IP confiable, sin DB o con configuración inválida no hay vía libre. */
export async function reserveDemoEmailQuota(request: Request, recipient: string, options: { db?: DemoEmailQuotaDb; env?: NodeJS.ProcessEnv } = {}) {
  const env = options.env ?? process.env
  const windows = [
    { scope: DEMO_EMAIL_SCOPES.global, fingerprint: hashToken(DEMO_EMAIL_SCOPES.global), max: limit(env.DEMO_EMAIL_GLOBAL_DAILY_LIMIT, DEMO_EMAIL_DEFAULT_LIMITS.global), ms: DAY, who: 'global' },
    { scope: DEMO_EMAIL_SCOPES.network, fingerprint: demoEmailNetworkFingerprint(request), max: limit(env.DEMO_EMAIL_NETWORK_DAILY_LIMIT, DEMO_EMAIL_DEFAULT_LIMITS.network), ms: DAY, who: 'network' },
    { scope: DEMO_EMAIL_SCOPES.recipient, fingerprint: demoEmailRecipientFingerprint(recipient), max: limit(env.DEMO_EMAIL_RECIPIENT_DAILY_LIMIT, DEMO_EMAIL_DEFAULT_LIMITS.recipient), ms: DAY, who: 'recipient' },
  ].sort((a, b) => a.scope.localeCompare(b.scope))
  const db = (options.db ?? prisma) as DemoEmailQuotaDb
  await db.$transaction(async tx => {
    for (const window of windows) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${window.scope}:${window.fingerprint}`}, 0))`
    }
    const clock = await tx.$queryRaw<Array<{ nowMs: bigint }>>`SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS "nowMs"`
    const epochMs = Number(clock[0]?.nowMs)
    const now = new Date(epochMs)
    if (!Number.isSafeInteger(epochMs) || !Number.isFinite(now.getTime())) throw new Error('Invalid quota clock')
    for (const window of windows) {
      const where = { scope: window.scope, fingerprint: window.fingerprint, createdAt: { gte: new Date(now.getTime() - window.ms) } }
      const count = await tx.authAttempt.count({ where })
      if (count >= window.max) {
        const oldest = await tx.authAttempt.findFirst({ where, orderBy: { createdAt: 'asc' }, select: { createdAt: true } })
        const retry = Math.max(1, Math.ceil(((oldest?.createdAt.getTime() ?? now.getTime()) + window.ms - now.getTime()) / 1000))
        const message = window.who === 'recipient'
          ? 'Ya te enviamos varios correos de la demo a esa dirección hoy. Probá con otro correo o volvé mañana.'
          : 'Alcanzamos el límite diario de correos de la demo. Probá de nuevo más tarde.'
        throw new DemoEmailError(`demo_rate_limited_${window.who}`, message, 429, retry)
      }
    }
    for (const window of windows) {
      await tx.authAttempt.deleteMany({ where: { scope: window.scope, fingerprint: window.fingerprint, createdAt: { lt: new Date(now.getTime() - window.ms) } } })
      await tx.authAttempt.create({ data: { scope: window.scope, fingerprint: window.fingerprint, createdAt: now } })
    }
  }, { maxWait: 10_000, timeout: 10_000 })
}
