import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

// Seguimientos de clientes pendientes. Con `due=today` devuelve los que vencen
// hoy o ya vencieron (según el día local de Paraguay, UTC-3) para el panel
// "Para hoy" de la sección de clientes.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const hoy = new URL(request.url).searchParams.get('due') === 'today'
  const local = new Date(Date.now() - 180 * 60000)
  const finDelDia = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 23, 59, 59, 999))
  const rows = await prisma.customerFollowUp.findMany({
    where: {
      tenantId: session.user.tenantId,
      doneAt: null,
      ...(hoy ? { dueAt: { lte: finDelDia } } : {}),
    },
    include: { customer: { select: { id: true, name: true, phone: true, countryCode: true } }, user: { select: { name: true } } },
    orderBy: { dueAt: 'asc' },
    take: 50,
  })
  return json(rows)
}
