import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { hasPermission, requireSession } from '../../../../lib/auth'
import { VENTANA_EN_LINEA_MS } from '../../../../lib/presence'

const DIAS = 30

// Consumo del equipo: solo ADMIN. Resumen por persona de los últimos 30 días y,
// con ?userId=, el detalle de sus pestañas de trabajo.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!hasPermission(session.user, 'team:manage')) return error('Solo el dueño puede ver el uso del equipo.', 403)
  const { tenantId } = session.user
  const url = new URL(request.url)
  const userId = url.searchParams.get('userId')
  if (userId) {
    const records = await prisma.usageSession.findMany({
      where: { tenantId, userId },
      orderBy: { lastSeenAt: 'desc' },
      take: 50,
      select: { firstSeenAt: true, lastSeenAt: true, activeSeconds: true },
    })
    return json({ records })
  }
  const desde = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000)
  const resumen = await prisma.usageSession.groupBy({
    by: ['userId'],
    where: { tenantId, firstSeenAt: { gte: desde } },
    _sum: { activeSeconds: true },
    _max: { lastSeenAt: true },
    _count: { _all: true },
  })
  const usuarios = await prisma.user.findMany({
    where: { tenantId, id: { in: resumen.map((fila) => fila.userId) } },
    select: { id: true, name: true, role: true },
  })
  const nombre = new Map(usuarios.map((usuario) => [usuario.id, usuario]))
  const enLinea = await prisma.presenceTab.findMany({
    where: { tenantId, lastSeenAt: { gte: new Date(Date.now() - VENTANA_EN_LINEA_MS) } },
    select: { userId: true },
    distinct: ['userId'],
  })
  const online = new Set(enLinea.map((fila) => fila.userId))
  const people = resumen
    .map((fila) => ({
      id: fila.userId,
      name: nombre.get(fila.userId)?.name ?? 'Sin nombre',
      role: nombre.get(fila.userId)?.role ?? '',
      sessions: fila._count._all,
      activeSeconds: fila._sum.activeSeconds ?? 0,
      lastSeenAt: fila._max.lastSeenAt,
      online: online.has(fila.userId),
    }))
    .sort((a, b) => b.activeSeconds - a.activeSeconds)
  return json({ people, days: DIAS })
}
