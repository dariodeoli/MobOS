import { error, json } from '../../../../lib/http'
import { lookupRuc, RucLookupError } from '../../../../lib/ruc'
import { reserveDemoRucQuota } from '../../../../lib/ruc-demo-quota'
import { logError } from '../../../../lib/log'
import { publicRucInput } from '../../../../lib/ruc-public'

export const dynamic = 'force-dynamic'

function privateResponse(response: Response) {
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export async function GET(request: Request) {
  try {
    const normalized = publicRucInput(request)
    // Configuración ausente: no gastar intentos ni salir a la red.
    if (!process.env.RUC_API_KEY?.trim()) throw new RucLookupError('provider_not_configured', 'La consulta RUC no está configurada. Completá los datos manualmente.', 503)
    await reserveDemoRucQuota(request)
    const lookup = await lookupRuc(normalized, { rejectSimulated: true })
    const result = lookup.result
    // Proyección explícita: nunca exponer cuotas comerciales, requestId o metadatos del proveedor.
    return privateResponse(json({
      query: { normalized: lookup.query.normalized, fullRuc: lookup.query.fullRuc },
      result: { nameOfficial: result.nameOfficial, name: result.nameOfficial, ruc: result.ruc, dv: result.dv, fullRuc: result.fullRuc, ...(result.equivalenceRaw !== undefined ? { equivalenceRaw: result.equivalenceRaw } : {}), ...(result.sourcePartition !== undefined ? { sourcePartition: result.sourcePartition } : {}) },
      reviewRequired: true,
      source: { provider: lookup.source.provider, queriedAt: lookup.source.queriedAt },
    }))
  } catch (cause) {
    if (cause instanceof RucLookupError) {
      const retry = cause.retryAfterSeconds
      const safeRetry = retry && Number.isSafeInteger(retry) && retry > 0 ? retry : undefined
      const response = error(cause.message, cause.status, { code: cause.code, manualEntryAllowed: true, ...(safeRetry ? { quotaRetryAfter: safeRetry } : {}) })
      if (safeRetry) response.headers.set('Retry-After', String(safeRetry))
      return privateResponse(response)
    }
    logError('ruc_demo_unavailable', { code: 'quota_or_provider_failure' })
    return privateResponse(error('No se pudo consultar el RUC. Completá los datos manualmente.', 503, { code: 'provider_unavailable', manualEntryAllowed: true }))
  }
}
