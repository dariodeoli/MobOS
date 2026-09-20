import { error, json } from '../../../../../../../lib/http'
import { prisma } from '../../../../../../../lib/prisma'
import { autenticarPuente } from '../../../../../../../lib/print-bridge'
import { ESTADOS_RESULTADO, estadoTrasResultado, textoOpcional } from '../../../../../../../lib/print-jobs'
import type { ResultadoAgente } from '../../../../../../../lib/print-jobs'

// Resultado reportado por el puente. El payload se borra en la misma
// transacción al cerrar el trabajo; un reporte repetido, ajeno o posterior al
// requeue responde con el estado actual (reconciliación) para que el agente
// vacíe su outbox sin reimprimir.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const puente = await autenticarPuente(request, prisma)
  if (!puente) return error('Token de puente inválido.', 401)
  const { id } = await context.params
  const body = await request.json().catch(() => null)
  const leaseId = textoOpcional(body?.leaseId, 200)
  const resultado = typeof body?.state === 'string' ? body.state.trim().toUpperCase() : ''
  if (!leaseId) return error('Falta el lease del trabajo.')
  if (!(ESTADOS_RESULTADO as readonly string[]).includes(resultado)) return error('El estado debe ser ACEPTADO, INCIERTO o FALLIDO.')

  const trabajo = await prisma.printJob.findFirst({ where: { id, tenantId: puente.tenantId } })
  if (!trabajo) return error('Trabajo no encontrado.', 404)
  if (!trabajo.leaseId || trabajo.leaseId !== leaseId) return json({ ok: true, applied: false, state: trabajo.state, reconciled: true })

  const nuevo = estadoTrasResultado(trabajo.state, resultado as ResultadoAgente)
  if (!nuevo) return json({ ok: true, applied: false, state: trabajo.state, reconciled: true })

  const errorReportado = textoOpcional(body?.error, 200)
  const transporte = textoOpcional(body?.transport, 40)
  const aplicado = await prisma.$transaction(async tx => {
    const cambio = await tx.printJob.updateMany({
      where: { id: trabajo.id, tenantId: puente.tenantId, state: 'RECLAMADO', leaseId },
      data: {
        state: nuevo,
        payload: null,
        leaseId: null,
        leaseExpiresAt: null,
        ...(nuevo === 'ACEPTADO' ? { acceptedAt: new Date() } : {}),
        ...(nuevo === 'FALLIDO' && !errorReportado ? { error: 'El puente reportó un fallo.' } : {}),
        ...(nuevo !== 'ACEPTADO' && errorReportado ? { error: errorReportado } : {}),
      },
    })
    if (!cambio.count) return false
    await tx.auditLog.create({
      data: {
        tenantId: puente.tenantId,
        action: nuevo === 'ACEPTADO' ? 'PRINT_JOB_ACCEPTED' : nuevo === 'INCIERTO' ? 'PRINT_JOB_INCIERTO' : 'PRINT_JOB_FAILED',
        entity: 'PrintJob',
        entityId: trabajo.id,
        metadata: { jobId: trabajo.id, attempts: trabajo.attempts, ...(trabajo.printerId ? { printerId: trabajo.printerId } : {}), ...(transporte ? { transport: transporte } : {}), ...(nuevo !== 'ACEPTADO' && errorReportado ? { error: errorReportado } : {}) },
      },
    })
    return true
  })

  if (!aplicado) {
    const actual = await prisma.printJob.findFirst({ where: { id: trabajo.id, tenantId: puente.tenantId }, select: { state: true } })
    return json({ ok: true, applied: false, state: actual?.state ?? trabajo.state, reconciled: true })
  }
  return json({ ok: true, applied: true, state: nuevo })
}
