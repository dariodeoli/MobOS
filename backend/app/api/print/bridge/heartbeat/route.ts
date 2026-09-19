import { error, json } from '../../../../../lib/http'
import { prisma } from '../../../../../lib/prisma'
import { autenticarPuente } from '../../../../../lib/print-bridge'
import { calcularLeaseExtendido, textoOpcional } from '../../../../../lib/print-jobs'

// Latido del puente: presencia (throttled a 1 escritura/20 s) y extensión del
// lease del trabajo en curso. El token nunca se registra.
const LATIDO_MIN_MS = 20_000

export async function POST(request: Request) {
  const puente = await autenticarPuente(request, prisma)
  if (!puente) return error('Token de puente inválido.', 401)
  const body = await request.json().catch(() => null)
  const ahora = new Date()
  const version = textoOpcional(body?.version, 40)
  const platform = textoOpcional(body?.platform, 40)
  if (!puente.lastSeenAt || ahora.getTime() - puente.lastSeenAt.getTime() >= LATIDO_MIN_MS) {
    await prisma.printBridge.update({
      where: { id: puente.id },
      data: { lastSeenAt: ahora, ...(version ? { version } : {}), ...(platform ? { platform } : {}) },
    })
  }

  let leaseExpiresAt: Date | null = null
  const jobId = textoOpcional(body?.jobId, 60)
  if (jobId) {
    const trabajo = await prisma.printJob.findFirst({
      where: { id: jobId, tenantId: puente.tenantId, state: 'RECLAMADO', leaseId: { not: null } },
      select: { id: true, leaseId: true, claimedAt: true },
    })
    if (trabajo?.leaseId) {
      const extendido = calcularLeaseExtendido(trabajo.claimedAt, ahora)
      if (extendido) {
        const cambio = await prisma.printJob.updateMany({
          where: { id: trabajo.id, tenantId: puente.tenantId, state: 'RECLAMADO', leaseId: trabajo.leaseId },
          data: { leaseExpiresAt: extendido },
        })
        if (cambio.count) leaseExpiresAt = extendido
      }
    }
  }

  return json({ ok: true, serverTime: ahora.toISOString(), ...(leaseExpiresAt ? { leaseExpiresAt } : {}) })
}
