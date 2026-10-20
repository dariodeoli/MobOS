import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { hashToken } from './auth'
import type { AuthAttemptStore } from './auth'
import { digitoVerificadorModulo11 } from './sifen/cdc'
import { ownDataMetadata, readBoundedJson } from './ruc-owndata'

const PROVIDER_BASE_URL = 'https://app.controlaria.online/api/v1/ruc/'
const HOUR_MS = 60 * 60 * 1000
const MONTH_MS = 31 * 24 * HOUR_MS

export class RucLookupError extends Error {
  constructor(public code: string, message: string, public status: number, public retryAfterSeconds?: number) { super(message) }
}

export type NormalizedRuc = { input: string; lookup: string; formatted: string | null }

/** Accepts common Paraguayan RUC formats but never guesses a check digit. */
export function normalizeRuc(input: unknown): NormalizedRuc {
  const raw = typeof input === 'string' ? input.trim() : ''
  if (!raw || raw.length > 32 || /[^0-9.\-\s]/.test(raw)) throw new RucLookupError('invalid_ruc', 'Ingresá un RUC válido, con o sin puntos y guion.', 400)
  const compact = raw.replace(/[.\s]/g, '')
  const hyphens = (compact.match(/-/g) || []).length
  if (hyphens > 1) throw new RucLookupError('invalid_ruc', 'Ingresá un RUC válido, con o sin puntos y guion.', 400)
  const [base, verifier] = compact.split('-')
  if (!/^[1-9]\d{0,8}$/.test(base || '') || (verifier !== undefined && !/^\d$/.test(verifier))) throw new RucLookupError('invalid_ruc', 'Ingresá un RUC válido, con o sin puntos y guion.', 400)
  if (verifier !== undefined && verifier !== String(digitoVerificadorModulo11(base))) throw new RucLookupError('invalid_ruc', 'El dígito verificador del RUC no es válido.', 400)
  // The source supports an exact RUC without its DV, so preserve it rather
  // than interpreting the final digit as a DV when a hyphen was omitted.
  return { input: raw, lookup: verifier === undefined ? base : `${base}-${verifier}`, formatted: verifier === undefined ? null : `${base}-${verifier}` }
}

export type RucQuotaDb = { $transaction: <T>(fn: (tx: AuthAttemptStore & Pick<Prisma.TransactionClient, '$executeRaw' | '$queryRaw'>) => Promise<T>, options?: { maxWait: number; timeout: number }) => Promise<T> }

async function consumeWindow(tx: AuthAttemptStore, scope: string, fingerprint: string, limit: number, windowMs: number, now: Date, code: 'account_rate_limited' | 'installation_rate_limited', message: string) {
  const since = new Date(now.getTime() - windowMs)
  const where = { scope, fingerprint, createdAt: { gte: since } }
  await tx.authAttempt.deleteMany({ where: { scope, fingerprint, createdAt: { lt: since } } })
  const count = await tx.authAttempt.count({ where })
  if (count >= limit) {
    const oldest = await tx.authAttempt.findFirst({ where, orderBy: { createdAt: 'asc' }, select: { createdAt: true } })
    const retry = Math.max(1, Math.ceil(((oldest?.createdAt.getTime() ?? now.getTime()) + windowMs - now.getTime()) / 1000))
    throw new RucLookupError(code, message, 429, retry)
  }
  await tx.authAttempt.create({ data: { scope, fingerprint, createdAt: now } })
  return count + 1
}

/**
 * Cuotas separadas por cuenta y por instalación autenticada, persistidas en
 * AuthAttempt (scope 'ruc:account' / 'ruc:installation', fingerprint derivado
 * en servidor, sin IDs en claro). Sobreviven reinicios y se limpian por ventana
 * en cada consumo: 1 hora por cuenta, 31 días por instalación, con los mismos
 * máximos de siempre (RUC_ACCOUNT_HOURLY_LIMIT / RUC_INSTALLATION_MONTHLY_LIMIT).
 */
export async function consumeRucQuota(accountId: string, installationId: string, options: { db?: RucQuotaDb; now?: Date } = {}) {
  const db = (options.db ?? prisma) as RucQuotaDb
  const accountLimit = Number(process.env.RUC_ACCOUNT_HOURLY_LIMIT ?? 12)
  const installationLimit = Number(process.env.RUC_INSTALLATION_MONTHLY_LIMIT ?? 90)
  if (![accountLimit, installationLimit].every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new RucLookupError('quota_not_configured', 'La consulta RUC no está disponible. Complete los datos manualmente.', 503)
  }
  const accountFingerprint = hashToken(`ruc:account:${accountId}`)
  const installationFingerprint = hashToken(`ruc:installation:${installationId}`)
  const used = await db.$transaction(async tx => {
    for (const key of [`ruc:account:${accountFingerprint}`, `ruc:installation:${installationFingerprint}`].sort()) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`
    }
    const clock = await tx.$queryRaw<Array<{ nowMs: bigint }>>`SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS "nowMs"`
    const epochMs = Number(clock[0]?.nowMs)
    if (!Number.isSafeInteger(epochMs) || !Number.isFinite(new Date(epochMs).getTime())) throw new Error('Invalid quota clock')
    const now = options.now ?? new Date(epochMs)
    const accountUsed = await consumeWindow(tx, 'ruc:account', accountFingerprint, accountLimit, HOUR_MS, now, 'account_rate_limited', 'Alcanzaste el límite temporal de consultas RUC. Intentá nuevamente más tarde o completá los datos manualmente.')
    const installationUsed = await consumeWindow(tx, 'ruc:installation', installationFingerprint, installationLimit, MONTH_MS, now, 'installation_rate_limited', 'La instalación alcanzó su cuota de consultas RUC. Podés completar los datos manualmente.')
    return { accountUsed, installationUsed }
  }, { maxWait: 10_000, timeout: 10_000 })
  return { accountRemaining: Math.max(0, accountLimit - used.accountUsed), installationRemaining: Math.max(0, installationLimit - used.installationUsed) }
}

/** The pilot is an account boundary, never a tenant-wide or role grant. */
export function assertRucPilot(identity: { id: string; tenantId: string; email: string | null; tenant: { email: string | null; emailVerifiedAt: Date | null } } | null) {
  const owner = 'dariodeoli@gmail.com'
  const userId = process.env.RUC_PILOT_USER_ID?.trim()
  const tenantId = process.env.RUC_PILOT_TENANT_ID?.trim()
  if (!userId || !tenantId || process.env.RUC_PILOT_OWNER_EMAIL?.trim().toLowerCase() !== owner) {
    throw new RucLookupError('pilot_not_configured', 'La consulta RUC privada no está configurada. Complete los datos manualmente.', 503)
  }
  // SessionContext deliberately omits email. The route reads this identity
  // from the authenticated user + tenant IDs, not headers or query claims.
  // Seller emails are editable and nonunique; they cannot identify the owner.
  // Only the explicitly allowed persisted user/tenant pair may use the pilot.
  if (!identity || identity.id !== userId || identity.tenantId !== tenantId
    || identity.email?.trim().toLowerCase() !== owner || identity.tenant.email?.trim().toLowerCase() !== owner || !identity.tenant.emailVerifiedAt) {
    throw new RucLookupError('pilot_forbidden', 'La consulta RUC está habilitada solo para la cuenta del piloto. Complete los datos manualmente.', 403)
  }
}

function unavailable(code = 'provider_unavailable') {
  return new RucLookupError(code, 'La consulta RUC no está disponible. Complete o revise los datos manualmente.', 503)
}

export async function lookupRuc(input: unknown, options: { fetchImpl?: typeof fetch; now?: Date; rejectSimulated?: boolean } = {}) {
  const query = normalizeRuc(input)
  const key = process.env.RUC_API_KEY?.trim()
  if (!key) throw unavailable('provider_not_configured')
  const signal = AbortSignal.timeout(8_000)
  let response: Response
  try {
    response = await (options.fetchImpl || fetch)(`${PROVIDER_BASE_URL}${encodeURIComponent(query.lookup)}`, {
      method: 'GET', headers: { Accept: 'application/json', 'X-API-Key': key },
      signal, cache: 'no-store', redirect: 'error', credentials: 'omit',
    })
  } catch { throw unavailable() }
  if (response.status !== 200 || response.redirected) {
    let code: unknown
    try {
      const body = await readBoundedJson(response, signal)
      const error = body.error
      if (error && typeof error === 'object' && !Array.isArray(error)) code = (error as Record<string, unknown>).code
    } catch { /* Malformed provider diagnostics are never reflected. */ }
    const safeCodes: Record<string, number> = {
      INVALID_RUC_FORMAT: 400, INVALID_RUC_DV: 400, ACCOUNT_PERIOD_CHANGED: 409,
      API_KEY_REQUIRED: 401, API_KEY_INVALID: 401, API_KEY_REVOKED: 401, API_KEY_EXPIRED: 401,
      API_KEY_ENVIRONMENT_MISMATCH: 401, INSUFFICIENT_SCOPE: 403, PLAN_REQUIRED: 403,
      REGISTERED_RUC_NOT_FOUND: 404, DAILY_QUOTA_REACHED: 429, METHOD_NOT_ALLOWED: 405,
      FREE_API_DISABLED: 503, COMMERCIAL_API_DISABLED: 503, COMMERCIAL_API_UNAVAILABLE: 503,
      DNIT_DATA_UNAVAILABLE: 503, INVALID_NAME_OPTIONS: 400,
    }
    if (typeof code === 'string' && Object.hasOwn(safeCodes, code) && safeCodes[code] === response.status) {
      const retry = response.headers.get('Retry-After')
      const seconds = response.status === 429 && retry && /^\d+$/.test(retry) && Number.isSafeInteger(Number(retry)) && Number(retry) > 0 ? Number(retry) : undefined
      // Provider credentials belong to this server; a failure must not invalidate the MobOS session.
      const status = response.status === 401 || response.status === 403 ? 503 : response.status
      throw new RucLookupError(code, 'No se pudo consultar el RUC. Complete o revise los datos manualmente.', status, seconds)
    }
    if (response.status === 429) {
      const retry = response.headers.get('Retry-After')
      const seconds = retry && /^\d+$/.test(retry) && Number.isSafeInteger(Number(retry)) && Number(retry) > 0 ? Number(retry) : undefined
      throw new RucLookupError('provider_rate_limited', 'Se alcanzó la cuota del proveedor RUC. Complete los datos manualmente o intente más tarde.', 429, seconds)
    }
    if (response.status === 404) throw new RucLookupError('not_found', 'No encontramos ese RUC. Verifique el número o cargue los datos manualmente.', 404)
    throw unavailable(response.status === 401 || response.status === 403 ? 'provider_not_configured' : 'provider_unavailable')
  }
  let payload: Record<string, unknown>
  try { payload = await readBoundedJson(response, signal) } catch { throw unavailable('provider_invalid') }
  const data = payload.data as Record<string, unknown> | undefined
  if (options.rejectSimulated && (payload.simulated === true || payload.simulado === true || data?.simulated === true || data?.simulado === true)) throw unavailable('provider_invalid')
  const base = query.lookup.split('-')[0]
  const dv = String(digitoVerificadorModulo11(base))
  // Taxpayer-state fields are deliberately ignored, including legacy status/stateRaw.
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || data.ruc !== base || data.dv !== dv || data.fullRuc !== `${base}-${dv}`
    || typeof data.nameOfficial !== 'string' || !data.nameOfficial.trim()
    || ('equivalenceRaw' in data && typeof data.equivalenceRaw !== 'string')
    || ('sourcePartition' in data && (!Number.isInteger(data.sourcePartition) || (data.sourcePartition as number) < 0 || (data.sourcePartition as number) > 9))) throw unavailable('provider_invalid')
  const meta = ownDataMetadata(payload.meta)
  if (!meta.environment || !meta.quota || !meta.provenance) throw unavailable('provider_invalid')
  const result = {
    name: data.nameOfficial, nameOfficial: data.nameOfficial,
    ruc: base, dv, fullRuc: `${base}-${dv}`,
    ...(typeof data.equivalenceRaw === 'string' ? { equivalenceRaw: data.equivalenceRaw } : {}),
    ...(typeof data.sourcePartition === 'number' ? { sourcePartition: data.sourcePartition } : {}),
  }
  const lookup = {
    query: { normalized: query.lookup, fullRuc: result.fullRuc }, result, reviewRequired: true,
    source: { provider: 'OwnData', queriedAt: (options.now || new Date()).toISOString() },
    ...(typeof payload.requestId === 'string' && /^req_[0-9a-f]{24}$/.test(payload.requestId) ? { requestId: payload.requestId } : {}),
    meta,
  }
  // Reject rather than alter official values if a provider reflects a key.
  if (JSON.stringify(lookup).includes(key)) throw unavailable('provider_invalid')
  return lookup
}
