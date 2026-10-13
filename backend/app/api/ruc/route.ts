import { requireSession } from '../../../lib/auth'
import { error, json } from '../../../lib/http'
import { assertRucPilot, consumeRucQuota, lookupRuc, normalizeRuc, RucLookupError } from '../../../lib/ruc'
import { prisma } from '../../../lib/prisma'

export const dynamic = 'force-dynamic'

function privateResponse(response: Response) {
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export async function GET(request: Request) {
  try {
    const session = await requireSession(request)
    if (!session) return privateResponse(error('Sesión inválida.', 401))
    const identity = await prisma.user.findFirst({
      where: { id: session.user.id, tenantId: session.user.tenantId },
      select: { id: true, tenantId: true, email: true, tenant: { select: { email: true, emailVerifiedAt: true } } },
    })
    assertRucPilot(identity)
    const input = new URL(request.url).searchParams.get('ruc') || ''
    const normalized = normalizeRuc(input)
    const installation = await prisma.session.findUnique({ where: { id: session.sessionId }, select: { deviceId: true } })
    const quota = await consumeRucQuota(`${session.user.tenantId}:${session.user.id}`, installation?.deviceId || session.sessionId)
    const lookup = await lookupRuc(normalized.lookup)
    // Audit only the minimum technical trace; no business name or raw fiscal
    // record is copied into the application database by a lookup.
    await prisma.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'RUC_LOOKUP_SUCCEEDED', entity: 'CustomerLookup', metadata: { rucLast4: lookup.query.fullRuc.slice(-4), provider: lookup.source.provider } } })
    return privateResponse(json({ ...lookup, quota }))
  } catch (cause) {
    if (cause instanceof RucLookupError) {
      const response = error(cause.message, cause.status, { code: cause.code, manualEntryAllowed: true, ...(cause.retryAfterSeconds ? { quotaRetryAfter: cause.retryAfterSeconds } : {}) })
      if (cause.retryAfterSeconds) response.headers.set('Retry-After', String(cause.retryAfterSeconds))
      return privateResponse(response)
    }
    return privateResponse(error('No se pudo consultar el RUC. Complete o revise los datos manualmente.', 503, { code: 'provider_unavailable', manualEntryAllowed: true }))
  }
}
