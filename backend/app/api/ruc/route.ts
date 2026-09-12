import { requireSession } from '../../../lib/auth'
import { error, json } from '../../../lib/http'
import { consumeRucQuota, lookupRuc, normalizeRuc, RucLookupError } from '../../../lib/ruc'
import { prisma } from '../../../lib/prisma'

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  try {
    const input = new URL(request.url).searchParams.get('ruc') || ''
    const normalized = normalizeRuc(input)
    const installation = await prisma.session.findUnique({ where: { id: session.sessionId }, select: { deviceId: true } })
    const quota = consumeRucQuota(`${session.user.tenantId}:${session.user.id}`, installation?.deviceId || session.sessionId)
    const lookup = await lookupRuc(normalized.lookup)
    // Audit only the minimum technical trace; no business name or raw fiscal
    // record is copied into the application database by a lookup.
    await prisma.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'RUC_LOOKUP_SUCCEEDED', entity: 'CustomerLookup', metadata: { rucLast4: lookup.query.fullRuc.slice(-4), provider: lookup.source.provider } } })
    return json({ ...lookup, quota })
  } catch (cause) {
    if (cause instanceof RucLookupError) {
      const response = error(cause.message, cause.status, { code: cause.code, manualEntryAllowed: true })
      if (cause.retryAfterSeconds) response.headers.set('Retry-After', String(cause.retryAfterSeconds))
      return response
    }
    return error('No se pudo consultar el RUC. Completá o revisá los datos manualmente.', 503, { code: 'provider_unavailable', manualEntryAllowed: true })
  }
}
