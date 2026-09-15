import { randomUUID } from 'node:crypto'
import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { enforceRateLimit } from '../../../lib/rate-limit'
import { logError } from '../../../lib/log'

const MAX_MESSAGE = 2000
const MAX_URL = 500
const MAX_STACK = 8000
const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/

function bounded(value: unknown, limit: number) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, limit) : null
}

function reportRequestId(request: Request) {
  const incoming = request.headers.get('x-request-id')
  return incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID()
}

// Público: el frontend reporta errores aun sin sesión (errores pre-login).
// Nunca filtra el contenido del error y siempre responde { ok: true } para no
// acoplar el reporte al estado del servidor.
export async function POST(request: Request) {
  const limited = enforceRateLimit(request, 'errors', 30, 60_000)
  if (limited) return limited
  const requestId = reportRequestId(request)
  const userAgent = typeof request.headers.get('user-agent') === 'string' ? request.headers.get('user-agent')!.slice(0, 240) : null
  try {
    let payload: unknown = null
    try { payload = await request.json() } catch { /* JSON inválido: se registra sin contenido */ }
    const body = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {}
    const message = bounded(body.message, MAX_MESSAGE)
    if (!message) return json({ ok: true })
    const url = bounded(body.url, MAX_URL)
    const stack = bounded(body.stack, MAX_STACK)
    const kind = body.kind === 'rejection' ? 'rejection' : 'unhandled'
    // Sin sesión queda tenantId null (error previo al login). Con sesión
    // válida el reporte se asocia al tenant para que el admin lo vea.
    const session = await requireSession(request)
    const tenantId = session?.user.tenantId ?? null
    try {
      await prisma.errorReport.create({ data: { tenantId, requestId, kind, message, ...(url ? { url } : {}), ...(stack ? { stack } : {}), ...(userAgent ? { userAgent } : {}) } })
    } catch (cause) {
      logError('error_report_persist_failed', { requestId, reason: cause instanceof Error ? cause.message : String(cause) })
    }
  } catch (cause) {
    logError('error_report_failed', { requestId, reason: cause instanceof Error ? cause.message : String(cause) })
  }
  return json({ ok: true })
}

// Solo ADMIN. Lista los últimos 200 del tenant más los pre-login (tenantId
// null, visibles para cualquier ADMIN). El stack no viaja en la lista; la
// vista de detalle (?id=) lo incluye únicamente si el reporte es del tenant.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  if (session.user.role !== 'ADMIN') return error('No autorizado.', 403)
  const visible = { OR: [{ tenantId: session.user.tenantId }, { tenantId: null }] }
  const id = new URL(request.url).searchParams.get('id')
  if (id) {
    const row = await prisma.errorReport.findFirst({ where: { id, ...visible } })
    if (!row) return error('Registro no encontrado.', 404)
    return json({ ...row, stack: row.tenantId === session.user.tenantId ? row.stack : null })
  }
  const rows = await prisma.errorReport.findMany({
    where: visible,
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, tenantId: true, requestId: true, kind: true, message: true, url: true, userAgent: true, createdAt: true },
  })
  return json(rows)
}
