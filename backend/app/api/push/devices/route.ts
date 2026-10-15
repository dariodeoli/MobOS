import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { prisma } from '../../../../lib/prisma'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { nativeClientVersion } from '../../../../lib/native-client'

// Alta/baja del token APNs del iPhone del usuario actual (docs/IOS.md).
// El token es único: si el mismo iPhone cambia de usuario, la fila pasa al nuevo.
export const dynamic = 'force-dynamic'
const TOKEN_PATTERN = /^[0-9a-fA-F]{64,200}$/

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, 'push-devices', 30, 15 * 60_000)
  if (limited) return limited
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida o expirada.', 401)
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const token = typeof body?.token === 'string' ? body.token.trim().toLowerCase() : ''
  if (!TOKEN_PATTERN.test(token)) return error('El token del dispositivo no es válido.', 400)
  const environment = body?.environment === 'sandbox' ? 'sandbox' : 'production'
  const appVersion = (typeof body?.appVersion === 'string' ? body.appVersion : nativeClientVersion(request) || '').trim().slice(0, 32) || null
  const row = await prisma.deviceToken.upsert({
    where: { token },
    create: { tenantId: session.user.tenantId, userId: session.user.id, platform: 'ios', token, environment, appVersion },
    update: { tenantId: session.user.tenantId, userId: session.user.id, environment, appVersion },
    select: { id: true },
  })
  return json({ ok: true, id: row.id })
}

export async function DELETE(request: Request) {
  const limited = enforceRateLimit(request, 'push-devices', 30, 15 * 60_000)
  if (limited) return limited
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida o expirada.', 401)
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const token = typeof body?.token === 'string' ? body.token.trim().toLowerCase() : ''
  if (!TOKEN_PATTERN.test(token)) return error('El token del dispositivo no es válido.', 400)
  const borrados = await prisma.deviceToken.deleteMany({ where: { token, userId: session.user.id, tenantId: session.user.tenantId } })
  return json({ ok: true, borrados: borrados.count })
}
