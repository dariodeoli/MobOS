import { requireSession } from '../../../../../../lib/auth'
import { error, json } from '../../../../../../lib/http'
import { prisma } from '../../../../../../lib/prisma'
import { MAX_SUFIJO, hashSufijo, sufijoCoincide, textoOpcional } from '../../../../../../lib/print-jobs'

// Confirmación en papel: solo un trabajo ACEPTADO puede pasar a CONFIRMADO y
// solo con el sufijo impreso. El valor nunca se devuelve, se compara hasheado y
// se borra del registro al confirmar; los fallos se auditan sin el valor.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const tenantId = session.user.tenantId
  const { id } = await context.params
  const body = await request.json().catch(() => null)
  const sufijo = textoOpcional(body?.suffix ?? body?.sufijo, MAX_SUFIJO + 1)
  if (!sufijo || sufijo.length > MAX_SUFIJO) return error('Escribí el número secreto que salió impreso después del guion.')

  const trabajo = await prisma.printJob.findFirst({ where: { id, tenantId } })
  if (!trabajo) return error('Trabajo no encontrado.', 404)
  if (trabajo.state === 'CONFIRMADO') return error('Este trabajo ya estaba confirmado en papel.', 409)
  if (trabajo.state !== 'ACEPTADO') return error('El trabajo todavía no está impreso: no se puede confirmar en papel.', 409)
  if (!trabajo.suffixHash) return error('Este trabajo no tiene un número secreto para confirmar.', 409)

  if (!sufijoCoincide(trabajo.suffixHash, hashSufijo(sufijo))) {
    const previos = await prisma.auditLog.count({ where: { action: 'PRINT_JOB_CONFIRM_FAILED', entityId: trabajo.id } })
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: session.user.id,
        action: 'PRINT_JOB_CONFIRM_FAILED',
        entity: 'PrintJob',
        entityId: trabajo.id,
        metadata: { jobId: trabajo.id, intentos: previos + 1 },
      },
    })
    return error('El número secreto no coincide con el impreso: revisá el papel.', 400)
  }

  const confirmado = await prisma.$transaction(async tx => {
    const cambio = await tx.printJob.updateMany({
      where: { id, tenantId, state: 'ACEPTADO', suffixHash: trabajo.suffixHash },
      data: { state: 'CONFIRMADO', confirmedAt: new Date(), suffixHash: '' },
    })
    if (!cambio.count) return false
    await tx.auditLog.create({
      data: { tenantId, userId: session.user.id, action: 'PRINT_JOB_CONFIRMED', entity: 'PrintJob', entityId: id, metadata: { jobId: id } },
    })
    return true
  })
  if (!confirmado) return error('El trabajo cambió de estado mientras confirmabas: volvé a intentar.', 409)
  return json({ ok: true, state: 'CONFIRMADO' })
}
