import { requireSession } from '../../../../../lib/auth'
import { error, json } from '../../../../../lib/http'
import { prisma } from '../../../../../lib/prisma'

// Edición de un puente (solo ADMIN): nombre y sucursal. El token no se toca.
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('No autorizado.', 403)
  const { id } = await context.params
  const tenantId = session.user.tenantId
  const puente = await prisma.printBridge.findFirst({ where: { id, tenantId, revokedAt: null } })
  if (!puente) return error('Puente no encontrado.', 404)
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return error('Datos del puente inválidos.')
  const entrada = body as Record<string, unknown>
  const cambios: Record<string, string | null> = {}
  if (entrada.name !== undefined) {
    const name = typeof entrada.name === 'string' ? entrada.name.trim() : ''
    if (!name || name.length > 120) return error('El nombre del puente es obligatorio (hasta 120 caracteres).')
    if (name !== puente.name) cambios.name = name
  }
  let branchId = puente.branchId
  if (entrada.branchId !== undefined) {
    if (entrada.branchId !== null && typeof entrada.branchId !== 'string') return error('Sucursal inválida.')
    const pedida = typeof entrada.branchId === 'string' && entrada.branchId.trim() ? entrada.branchId.trim().slice(0, 200) : null
    if (pedida) {
      const sucursal = await prisma.branch.findFirst({ where: { id: pedida, tenantId }, select: { id: true } })
      if (!sucursal) return error('La sucursal elegida no existe en la empresa.', 404)
    }
    branchId = pedida
  }
  if (branchId !== puente.branchId) cambios.branchId = branchId
  if (!Object.keys(cambios).length) return json({ id: puente.id, name: puente.name, branchId: puente.branchId })
  const actualizado = await prisma.$transaction(async tx => {
    const guardado = await tx.printBridge.update({ where: { id: puente.id }, data: cambios })
    await tx.auditLog.create({
      data: {
        tenantId,
        userId: session.user.id,
        action: 'PRINT_BRIDGE_UPDATED',
        entity: 'PrintBridge',
        entityId: guardado.id,
        metadata: { bridgeId: guardado.id, name: guardado.name, changes: { ...(cambios.name !== undefined ? { name: { from: puente.name, to: cambios.name } } : {}), ...(cambios.branchId !== undefined ? { branchId: { from: puente.branchId, to: cambios.branchId } } : {}) } },
      },
    })
    return guardado
  })
  return json({ id: actualizado.id, name: actualizado.name, branchId: actualizado.branchId })
}

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
