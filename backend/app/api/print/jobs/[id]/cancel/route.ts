import { requireSession } from '../../../../../../lib/auth'
import { error, json } from '../../../../../../lib/http'
import { prisma } from '../../../../../../lib/prisma'
import { cancelarTrabajos, shapePublico } from '../../../../../../lib/print-jobs'

const ROLES_QUE_CANCELAN = ['ADMIN', 'GERENTE']

// Cancelación de un trabajo de impresión PENDIENTE (#128). Solo se cancela lo
// que todavía no salió: si el puente lo reclamó (RECLAMADO) o el transporte lo
// aceptó, la vía es la confirmación o la revisión en papel, nunca el borrado.
// La auditoría PRINT_JOB_CANCELLED queda con el actor real en la misma
// transacción que el cambio de estado.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!ROLES_QUE_CANCELAN.includes(session.user.role)) return error('Solo administración o gerencia cancelan trabajos de impresión.', 403)

  const { id } = await context.params
  const tenantId = session.user.tenantId
  const trabajo = await prisma.printJob.findFirst({ where: { id, tenantId }, select: { id: true, state: true } })
  if (!trabajo) return error('Trabajo no encontrado.', 404)
  if (trabajo.state === 'CANCELADO') return error('Este trabajo ya estaba cancelado.', 409)
  if (trabajo.state !== 'PENDIENTE') {
    return error('El trabajo ya salió de la cola (el puente lo reclamó o lo aceptó): no se puede cancelar. Confirmalo en papel o revisalo en la cola.', 409)
  }

  const [cancelado] = await cancelarTrabajos(prisma, tenantId, { ids: [id] }, { userId: session.user.id, via: 'individual' })
  if (!cancelado) return error('El trabajo cambió de estado mientras lo cancelabas: volvé a intentar.', 409)

  const actual = await prisma.printJob.findUnique({ where: { id } })
  return json({ ok: true, job: actual ? shapePublico(actual) : null })
}
