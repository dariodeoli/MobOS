import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { VENTANA_EN_LINEA_MS } from '../../../lib/presence'

type Presente = { id: string; name: string; role: string; scope: string | null; active: boolean; lastSeenAt: string }

// Personas en línea de la empresa (latido en los últimos 75 s), una entrada por
// persona con la sección más reciente. Cualquier sesión de la empresa puede ver
// quién está trabajando; el consumo histórico queda solo para ADMIN.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const desde = new Date(Date.now() - VENTANA_EN_LINEA_MS)
  const filas = await prisma.presenceTab.findMany({
    where: { tenantId: session.user.tenantId, lastSeenAt: { gte: desde } },
    include: { user: { select: { id: true, name: true, role: true } } },
    orderBy: { lastSeenAt: 'desc' },
    take: 500,
  })
  const porUsuario = new Map<string, Presente>()
  for (const fila of filas) {
    const previo = porUsuario.get(fila.userId)
    if (!previo) {
      porUsuario.set(fila.userId, {
        id: fila.userId,
        name: fila.user.name,
        role: fila.user.role,
        scope: fila.scope,
        active: fila.isActive,
        lastSeenAt: fila.lastSeenAt.toISOString(),
      })
    } else if (fila.isActive) {
      previo.active = true
    }
  }
  return json({ people: Array.from(porUsuario.values()) })
}
