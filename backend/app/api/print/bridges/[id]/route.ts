import { requireSession } from '../../../../../lib/auth'
import { error, json } from '../../../../../lib/http'
import { prisma } from '../../../../../lib/prisma'

// Baja de un puente: revocación lógica. El token deja de autenticar y el
// código de vinculación pendiente se invalida; la fila se conserva.
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('No autorizado.', 403)
  const { id } = await context.params
  const tenantId = session.user.tenantId
  const puente = await prisma.printBridge.findFirst({ where: { id, tenantId, revokedAt: null } })
  if (!puente) return error('Puente no encontrado.', 404)
  await prisma.$transaction(async tx => {
    await tx.printBridge.update({ where: { id: puente.id }, data: { revokedAt: new Date(), pairingCodeHash: null, pairingExpiresAt: null, pairingUsedAt: null } })
    await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'PRINT_BRIDGE_REVOKED', entity: 'PrintBridge', entityId: puente.id, metadata: {} } })
  })
  return json({ ok: true })
}
