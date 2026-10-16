import { isIP } from 'node:net'
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { hashToken, trustedClientIp } from './auth'
import { RucLookupError } from './ruc'

const HOUR = 3_600_000
const GLOBAL_SCOPE = 'ruc:demo:global'
const NETWORK_SCOPE = 'ruc:demo:network'
type Store = Pick<Prisma.TransactionClient, 'authAttempt' | '$queryRaw' | '$executeRaw'>
export type DemoQuotaDb = { $transaction: <T>(fn: (tx: Store) => Promise<T>, options?: { maxWait: number; timeout: number }) => Promise<T> }

function limit(value: string | undefined, maximum: number) {
  if (value === undefined) return maximum
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > maximum) {
    throw new RucLookupError('demo_quota_not_configured', 'La consulta RUC no está disponible. Completá los datos manualmente.', 503)
  }
  return Number(value)
}

/** Canonicaliza solo una IP validada del proxy confiable. Desconocidos siempre comparten cupo. */
export function demoNetworkFingerprint(request: Request) {
  const ip = trustedClientIp(request)
  let canonical = 'untrusted-network'
  if (ip && isIP(ip)) {
    canonical = isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname.slice(1, -1).toLowerCase() : ip
    // IPv4-mapped IPv6 y la dirección IPv4 son la misma red para la cuota.
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical)
    if (mapped) {
      const bits = Number.parseInt(mapped[1], 16) * 65536 + Number.parseInt(mapped[2], 16)
      canonical = [bits >>> 24, (bits >>> 16) & 255, (bits >>> 8) & 255, bits & 255].join('.')
    }
  }
  return hashToken(`${NETWORK_SCOPE}:${canonical}`)
}

/** Reserva ambos presupuestos antes del proveedor. Sin IP, sin DB o sin configuración no hay vía libre. */
export async function reserveDemoRucQuota(request: Request, options: { db?: DemoQuotaDb; env?: NodeJS.ProcessEnv } = {}) {
  const env = options.env ?? process.env
  const windows = [
    { scope: GLOBAL_SCOPE, fingerprint: hashToken(GLOBAL_SCOPE), max: limit(env.RUC_DEMO_GLOBAL_DAILY_LIMIT, 90), ms: 24 * HOUR },
    { scope: NETWORK_SCOPE, fingerprint: demoNetworkFingerprint(request), max: limit(env.RUC_DEMO_NETWORK_HOURLY_LIMIT, 12), ms: HOUR },
  ].sort((a, b) => a.scope.localeCompare(b.scope))
  const db = (options.db ?? prisma) as DemoQuotaDb
  await db.$transaction(async tx => {
    // Mismo orden en todas las réplicas; la transacción no abarca la petición externa.
    for (const window of windows) {
      const key = `${window.scope}:${window.fingerprint}`
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`
    }
    // now() sería el inicio de transacción, anterior a la espera del lock.
    const clock = await tx.$queryRaw<Array<{ nowMs: bigint }>>`SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS "nowMs"`
    const epochMs = Number(clock[0]?.nowMs)
    const now = new Date(epochMs)
    if (!Number.isSafeInteger(epochMs) || !Number.isFinite(now.getTime())) throw new Error('Invalid quota clock')
    for (const window of windows) {
      const since = new Date(now.getTime() - window.ms)
      const where = { scope: window.scope, fingerprint: window.fingerprint, createdAt: { gte: since } }
      const count = await tx.authAttempt.count({ where })
      if (count >= window.max) {
        const oldest = await tx.authAttempt.findFirst({ where, orderBy: { createdAt: 'asc' }, select: { createdAt: true } })
        const retry = Math.max(1, Math.ceil(((oldest?.createdAt.getTime() ?? now.getTime()) + window.ms - now.getTime()) / 1000))
        throw new RucLookupError('demo_rate_limited', 'Alcanzaste el límite temporal de consultas RUC. Completá los datos manualmente o intentá más tarde.', 429, retry)
      }
    }
    for (const window of windows) {
      await tx.authAttempt.deleteMany({ where: { scope: window.scope, fingerprint: window.fingerprint, createdAt: { lt: new Date(now.getTime() - window.ms) } } })
      await tx.authAttempt.create({ data: { scope: window.scope, fingerprint: window.fingerprint, createdAt: now } })
    }
  }, { maxWait: 10_000, timeout: 10_000 })
}
