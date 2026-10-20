import { prisma } from './prisma'
import { AuthRateLimitError, consumeAuthAttemptWindow, hashToken } from './auth'
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

export type RucQuotaDb = { $transaction: <T>(fn: (tx: AuthAttemptStore) => Promise<T>) => Promise<T> }

async function consumeWindow(tx: AuthAttemptStore, scope: string, fingerprint: string, limit: number, windowMs: number, now: Date, code: 'account_rate_limited' | 'installation_rate_limited', message: string) {
  try {
    return await consumeAuthAttemptWindow(tx, scope, fingerprint, limit, windowMs, now)
  } catch (cause) {
    if (cause instanceof AuthRateLimitError) throw new RucLookupError(code, message, 429, cause.retryAfterSeconds)
    throw cause
  }
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
  const now = options.now ?? new Date()
  const accountLimit = Number(process.env.RUC_ACCOUNT_HOURLY_LIMIT || 12)
  const installationLimit = Number(process.env.RUC_INSTALLATION_MONTHLY_LIMIT || 90)
  const accountFingerprint = hashToken(`ruc:account:${accountId}`)
  const installationFingerprint = hashToken(`ruc:installation:${installationId}`)
  const used = await db.$transaction(async tx => {
    const accountUsed = await consumeWindow(tx, 'ruc:account', accountFingerprint, accountLimit, HOUR_MS, now, 'account_rate_limited', 'Alcanzaste el límite temporal de consultas RUC. Intentá nuevamente más tarde o completá los datos manualmente.')
    const installationUsed = await consumeWindow(tx, 'ruc:installation', installationFingerprint, installationLimit, MONTH_MS, now, 'installation_rate_limited', 'La instalación alcanzó su cuota de consultas RUC. Podés completar los datos manualmente.')
    return { accountUsed, installationUsed }
  })
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
      signal, cache: 'no-store', redirect: 'error',
    })
  } catch { throw unavailable() }
  if (response.status === 429) {
    const retry = response.headers.get('Retry-After')
    const seconds = retry && /^\d+$/.test(retry) && Number.isSafeInteger(Number(retry)) && Number(retry) > 0 ? Number(retry) : undefined
    throw new RucLookupError('provider_rate_limited', 'Se alcanzó la cuota del proveedor RUC. Complete los datos manualmente o intente más tarde.', 429, seconds)
  }
  if (response.status === 404) throw new RucLookupError('not_found', 'No encontramos ese RUC. Verifique el número o cargue los datos manualmente.', 404)
  if (response.status === 401 || response.status === 403) throw unavailable('provider_not_configured')
  if (response.status !== 200 || response.redirected) throw unavailable()
  let payload: Record<string, unknown>
  try { payload = await readBoundedJson(response, signal) } catch { throw unavailable('provider_invalid') }
  const data = payload.data as Record<string, unknown> | undefined
  if (options.rejectSimulated && (payload.simulated === true || payload.simulado === true || data?.simulated === true || data?.simulado === true)) throw unavailable('provider_invalid')
  const base = query.lookup.split('-')[0]
  const dv = String(digitoVerificadorModulo11(base))
  // Taxpayer state is optional metadata. It is accepted for old OwnData
  // responses only so the parser remains forward/backward compatible; it is
  // deliberately never copied into the MobOS response contract.
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || data.ruc !== base || data.dv !== dv || data.fullRuc !== `${base}-${dv}`
    || typeof data.nameOfficial !== 'string' || !data.nameOfficial.trim()
    || (data.equivalenceRaw !== undefined && typeof data.equivalenceRaw !== 'string')
    || (data.sourcePartition !== undefined && typeof data.sourcePartition !== 'string')) throw unavailable('provider_invalid')
  const meta = ownDataMetadata(payload.meta)
  if (!meta.environment || !meta.quota || !meta.provenance) throw unavailable('provider_invalid')
  const result = {
    name: data.nameOfficial, nameOfficial: data.nameOfficial,
    ruc: base, dv, fullRuc: `${base}-${dv}`,
    ...(typeof data.equivalenceRaw === 'string' ? { equivalenceRaw: data.equivalenceRaw } : {}),
    ...(typeof data.sourcePartition === 'string' ? { sourcePartition: data.sourcePartition } : {}),
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
