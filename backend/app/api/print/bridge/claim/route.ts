import { error, json } from '../../../../../lib/http'
import { prisma } from '../../../../../lib/prisma'
import { autenticarPuente, remoteEnabledDeTenant } from '../../../../../lib/print-bridge'
import { purgarMetadatos, reclamarTrabajo, reencolarVencidos, shapeAgente } from '../../../../../lib/print-jobs'

// Claim del agente: purga oportunista, reencola leases vencidos y entrega el
// trabajo más viejo con lease. Sin trabajo responde `{ jobs: [] }` para que el
// poller vuelva a esperar.
export async function POST(request: Request) {
  const puente = await autenticarPuente(request, prisma)
  if (!puente) return error('Token de puente inválido.', 401)
  const tenant = await prisma.tenant.findUnique({ where: { id: puente.tenantId }, select: { settings: true } })
  if (!remoteEnabledDeTenant(tenant?.settings)) return error('La impresión remota está desactivada para esta empresa.', 409)

  const ahora = new Date()
  // El claim también es un poll (2 s): la presencia se escribe throttled, no se
  // audita cada vuelta.
  if (!puente.lastSeenAt || ahora.getTime() - puente.lastSeenAt.getTime() >= 20_000) {
    await prisma.printBridge.update({ where: { id: puente.id }, data: { lastSeenAt: ahora } })
  }
  await purgarMetadatos(prisma, puente.tenantId, ahora)
  const resagados = await reencolarVencidos(prisma, puente.tenantId, ahora)
  for (const cambio of resagados) {
    await prisma.auditLog.create({
      data: {
        tenantId: puente.tenantId,
        action: cambio.state === 'PENDIENTE' ? 'PRINT_JOB_REQUEUED' : 'PRINT_JOB_FAILED',
        entity: 'PrintJob',
        entityId: cambio.id,
        metadata: { attempts: cambio.attempts, reason: cambio.state === 'PENDIENTE' ? 'lease-vencido' : 'intentos-agotados' },
      },
    })
  }
  const trabajo = await reclamarTrabajo(prisma, puente.tenantId, puente.id, ahora)
  if (!trabajo) return json({ jobs: [] })
  return json({ jobs: [shapeAgente(trabajo)] })
}
