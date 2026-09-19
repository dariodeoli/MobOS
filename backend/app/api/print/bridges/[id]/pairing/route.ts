import { requireSession } from '../../../../../../lib/auth'
import { error, json } from '../../../../../../lib/http'
import { prisma } from '../../../../../../lib/prisma'
import { crearCodigoVinculacion } from '../../../../../../lib/print-bridge'

// Regenera el código de vinculación de un puente (solo ADMIN). El código
// anterior queda inválido, junto con sus intentos ya consumidos.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('No autorizado.', 403)
  const { id } = await context.params
  const puente = await prisma.printBridge.findFirst({ where: { id, tenantId: session.user.tenantId } })
  if (!puente) return error('Puente no encontrado.', 404)
  if (puente.revokedAt) return error('El puente está revocado: creá uno nuevo para vincularlo.', 409)
  const { code, codeHash, expiresAt } = crearCodigoVinculacion()
  await prisma.printBridge.update({ where: { id: puente.id }, data: { pairingCodeHash: codeHash, pairingExpiresAt: expiresAt, pairingUsedAt: null, pairingAttempts: 0 } })
  return json({ bridge: { id: puente.id, name: puente.name }, pairingCode: code, expiresAt })
}
