import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { acumularSegundos, normalizarAlcance } from '../../../../lib/presence'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Latido de presencia: una fila por pestaña. La pestaña pasa a "en línea" por
// 75 s y el consumo solo suma cuando hubo actividad y el pulso llegó a tiempo.
export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  let body: any
  try { body = await request.json() } catch { return error('JSON inválido.') }
  const tabId = typeof body?.tabId === 'string' && UUID.test(body.tabId) ? body.tabId : null
  if (!tabId || typeof body?.visible !== 'boolean' || typeof body?.active !== 'boolean') return error('Presencia inválida.')
  const { tenantId, id: userId } = session.user
  const alcance = normalizarAlcance(body.scope)
  const activo = body.visible === true && body.active === true
  const ahora = new Date()
  const previa = await prisma.presenceTab.findUnique({ where: { tenantId_userId_tabId: { tenantId, userId, tabId } }, select: { lastSeenAt: true } })
  const sumar = acumularSegundos(previa?.lastSeenAt, activo, ahora)
  await prisma.$transaction([
    prisma.presenceTab.upsert({
      where: { tenantId_userId_tabId: { tenantId, userId, tabId } },
      create: { tenantId, userId, tabId, scope: alcance, lastSeenAt: ahora, isActive: activo },
      update: { scope: alcance, lastSeenAt: ahora, isActive: activo },
    }),
    prisma.usageSession.upsert({
      where: { tenantId_userId_sessionKey: { tenantId, userId, sessionKey: tabId } },
      create: { tenantId, userId, sessionKey: tabId, lastSeenAt: ahora, wasActive: activo, activeSeconds: sumar },
      update: { lastSeenAt: ahora, wasActive: activo, activeSeconds: { increment: sumar } },
    }),
  ])
  return json({ ok: true })
}
