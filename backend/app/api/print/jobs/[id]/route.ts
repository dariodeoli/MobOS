import { requireSession } from '../../../../../lib/auth'
import { error, json } from '../../../../../lib/http'
import { prisma } from '../../../../../lib/prisma'
import { shapePublico } from '../../../../../lib/print-jobs'

// Detalle público de un trabajo de la empresa. Nunca expone payload, sufijo ni
// lease; un trabajo de otra empresa responde 404.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const { id } = await context.params
  const job = await prisma.printJob.findFirst({ where: { id, tenantId: session.user.tenantId } })
  if (!job) return error('Trabajo no encontrado.', 404)
  return json({ job: shapePublico(job) })
}
