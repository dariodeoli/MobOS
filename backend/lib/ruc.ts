const PROVIDER_BASE_URL = 'https://ruc.sun.com.py/api/ruc/'
const HOUR_MS = 60 * 60 * 1000
const MONTH_MS = 31 * 24 * HOUR_MS
const accountHits = new Map<string, number[]>()
const installationHits = new Map<string, number[]>()

export class RucLookupError extends Error {
  constructor(public code: string, message: string, public status: number, public retryAfterSeconds?: number) { super(message) }
}

export type NormalizedRuc = { input: string; lookup: string; formatted: string | null }

function digits(value: string) { return value.replace(/[^0-9]/g, '') }

/** Accepts common Paraguayan RUC formats but never guesses a check digit. */
export function normalizeRuc(input: unknown): NormalizedRuc {
  const raw = typeof input === 'string' ? input.trim() : ''
  if (!raw || raw.length > 32 || /[^0-9.\-\s]/.test(raw)) throw new RucLookupError('invalid_ruc', 'Ingresá un RUC válido, con o sin puntos y guion.', 400)
  const compact = raw.replace(/[.\s]/g, '')
  const hyphens = (compact.match(/-/g) || []).length
  if (hyphens > 1) throw new RucLookupError('invalid_ruc', 'Ingresá un RUC válido, con o sin puntos y guion.', 400)
  const [base, verifier] = compact.split('-')
  if (!/^\d{5,12}$/.test(base || '') || (verifier !== undefined && !/^\d$/.test(verifier))) throw new RucLookupError('invalid_ruc', 'Ingresá un RUC válido, con o sin puntos y guion.', 400)
  // The source supports an exact RUC without its DV, so preserve it rather
  // than interpreting the final digit as a DV when a hyphen was omitted.
  return { input: raw, lookup: verifier === undefined ? base : `${base}-${verifier}`, formatted: verifier === undefined ? null : `${base}-${verifier}` }
}

function prune(hits: number[], cutoff: number) {
  while (hits.length && hits[0] <= cutoff) hits.shift()
}

export function resetRucRateLimitsForTests() {
  accountHits.clear(); installationHits.clear()
}

/**
 * Cuotas separadas por cuenta y por instalación autenticada. Se usan IDs de
 * sesión (no IP) porque las cajas suelen compartir salida a Internet.
 */
export function consumeRucQuota(accountId: string, installationId: string, now = Date.now()) {
  const accountLimit = Number(process.env.RUC_ACCOUNT_HOURLY_LIMIT || 12)
  const installationLimit = Number(process.env.RUC_INSTALLATION_MONTHLY_LIMIT || 90)
  const account = accountHits.get(accountId) || []
  const installation = installationHits.get(installationId) || []
  prune(account, now - HOUR_MS); prune(installation, now - MONTH_MS)
  if (account.length >= accountLimit) throw new RucLookupError('account_rate_limited', 'Alcanzaste el límite temporal de consultas RUC. Intentá nuevamente más tarde o completá los datos manualmente.', 429, Math.max(1, Math.ceil((account[0] + HOUR_MS - now) / 1000)))
  if (installation.length >= installationLimit) throw new RucLookupError('installation_rate_limited', 'La instalación alcanzó su cuota de consultas RUC. Podés completar los datos manualmente.', 429, Math.max(1, Math.ceil((installation[0] + MONTH_MS - now) / 1000)))
  account.push(now); installation.push(now); accountHits.set(accountId, account); installationHits.set(installationId, installation)
  return { accountRemaining: Math.max(0, accountLimit - account.length), installationRemaining: Math.max(0, installationLimit - installation.length) }
}

function text(value: unknown, limit = 240) { return typeof value === 'string' ? value.trim().slice(0, limit) : '' }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }

function providerUrl(ruc: NormalizedRuc) {
  const configured = process.env.RUC_SUN_API_URL || PROVIDER_BASE_URL
  let url: URL
  try { url = new URL(configured) } catch { throw new RucLookupError('provider_unavailable', 'La consulta RUC no está disponible. Completá los datos manualmente.', 503) }
  if (url.protocol !== 'https:' || url.hostname !== 'ruc.sun.com.py' || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/')) throw new RucLookupError('provider_unavailable', 'La consulta RUC no está disponible. Completá los datos manualmente.', 503)
  url.pathname += encodeURIComponent(ruc.lookup)
  return url
}

export async function lookupRuc(input: unknown, options: { fetchImpl?: typeof fetch; now?: Date } = {}) {
  const query = normalizeRuc(input)
  const fetchImpl = options.fetchImpl || fetch
  const headers: HeadersInit = { Accept: 'application/json' }
  if (process.env.RUC_SUN_API_KEY) headers['X-API-Key'] = process.env.RUC_SUN_API_KEY
  let response: Response
  try {
    response = await fetchImpl(providerUrl(query), { headers, signal: AbortSignal.timeout(8_000), cache: 'no-store' })
  } catch {
    throw new RucLookupError('provider_unavailable', 'La consulta RUC no respondió. Completá o revisá los datos manualmente.', 503)
  }
  if (response.status === 404) throw new RucLookupError('not_found', 'No encontramos ese RUC. Verificá el número o cargá los datos manualmente.', 404)
  if (response.status === 401 || response.status === 403 || response.status === 429 || response.status >= 500) throw new RucLookupError('provider_unavailable', 'La consulta RUC no está disponible ahora. Completá o revisá los datos manualmente.', 503)
  if (!response.ok) throw new RucLookupError('provider_unavailable', 'La consulta RUC no está disponible ahora. Completá o revisá los datos manualmente.', 503)
  let payload: Record<string, unknown>
  try { payload = record(await response.json()) } catch { throw new RucLookupError('provider_invalid', 'La consulta RUC devolvió una respuesta no válida. Completá los datos manualmente.', 503) }
  const name = text(payload.name || payload.razonSocial || payload.businessName)
  const ruc = text(payload.ruc || query.lookup.split('-')[0], 16)
  const dv = text(payload.dv, 2)
  const fullRuc = text(payload.fullRuc, 20) || (dv ? `${ruc}-${dv}` : query.formatted || ruc)
  if (!name || !/^\d{5,12}(?:-\d)?$/.test(fullRuc)) throw new RucLookupError('provider_invalid', 'La consulta RUC devolvió datos incompletos. Completá los datos manualmente.', 503)
  const sifen = record(payload.sifenMandate)
  const siara = record(payload.siara)
  const now = options.now || new Date()
  return {
    query: { normalized: query.lookup, fullRuc },
    result: {
      name, ruc, dv: dv || null, fullRuc, state: text(payload.state, 80) || null,
      publicationDateText: text(payload.publicationDateText, 80) || null,
      sifenMandate: Object.keys(sifen).length ? { group: text(sifen.group, 80) || null, startsAt: text(sifen.startsAt || sifen.startDate, 40) || null, sourceUrl: text(sifen.sourceUrl || sifen.url, 500) || null } : null,
      siara: Object.keys(siara).length ? { group: text(siara.group, 80) || null, category: text(siara.category, 100) || null, legalType: text(siara.legalType, 100) || null, city: text(siara.city, 100) || null, state: text(siara.state, 80) || null } : null,
    },
    reviewRequired: true,
    source: { provider: 'RUC SUN', documentationUrl: 'https://ruc.sun.com.py/api-docs', queriedAt: now.toISOString() },
  }
}
