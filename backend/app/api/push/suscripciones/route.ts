import { error, json, tenantId } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { prisma } from '../../../../lib/prisma'
import { quitarWebPush, suscribirWebPush } from '../../../../lib/web-push'

// A1 (#279): alta/baja de la suscripción de Web Push del usuario actual. El
// endpoint del navegador es único: reconectar el mismo dispositivo actualiza la
// fila (no duplica avisos).
export async function POST(request: Request) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  let body: Record<string, unknown> = {}
  try { body = await request.json() } catch { return error('JSON inválido.') }
  const silencioDesde = Number.isFinite(Number(body?.silencioDesde)) ? Math.max(0, Math.min(1439, Math.round(Number(body.silencioDesde)))) : null
  const silencioHasta = Number.isFinite(Number(body?.silencioHasta)) ? Math.max(0, Math.min(1439, Math.round(Number(body.silencioHasta)))) : null
  const resultado = await suscribirWebPush({
    tenantId: tenant,
    userId: session.user.id,
    suscripcion: (body?.suscripcion || {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } },
    userAgent: String(body?.userAgent || request.headers.get('user-agent') || ''),
    silencioDesde,
    silencioHasta,
  })
  if (!resultado.ok) return error('La suscripción no es válida.', 400)
  return json({ ok: true, id: resultado.id })
}

export async function DELETE(request: Request) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  let body: Record<string, unknown> = {}
  try { body = await request.json() } catch { return error('JSON inválido.') }
  const endpoint = String(body?.endpoint || '')
  if (!endpoint) return error('Falta el endpoint.')
  return json(await quitarWebPush({ tenantId: tenant, userId: session.user.id, endpoint }))
}

// Listado mínimo del propio usuario (diagnóstico y preferencias).
export async function GET(request: Request) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  const filas = await prisma.webPushSubscription.findMany({ where: { tenantId: tenant, userId: session.user.id }, select: { id: true, userAgent: true, silencioDesde: true, silencioHasta: true, lastUsedAt: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20 })
  return json({ dispositivos: filas })
}
