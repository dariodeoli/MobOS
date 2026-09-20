import { hashToken, hasPermission, requireSession } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { prisma } from '../../../../lib/prisma'
import { MAX_PUENTES_POR_EMPRESA, crearCodigoVinculacion, generarTokenPuente, shapePuente, topeDePuentesAlcanzado } from '../../../../lib/print-bridge'

// Lista los puentes activos de la empresa (permiso de impresión). El token y
// el código de vinculación nunca se devuelven: solo su nombre, versión y
// última conexión.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!hasPermission(session.user, 'print:manage')) return error('No autorizado.', 403)
  const bridges = await prisma.printBridge.findMany({ where: { tenantId: session.user.tenantId, revokedAt: null }, orderBy: { createdAt: 'asc' } })
  return json({ bridges: bridges.map(puente => shapePuente(puente)) })
}

// Alta de un puente (solo ADMIN): se guarda el hash de un token descartable y
// se emite un código de vinculación que se muestra una única vez.
export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!hasPermission(session.user, 'print:manage')) return error('No autorizado.', 403)
  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 120) return error('El nombre del puente es obligatorio (hasta 120 caracteres).')
  const tenantId = session.user.tenantId
  const branchId = typeof body?.branchId === 'string' && body.branchId.trim() ? body.branchId.trim().slice(0, 200) : null
  if (branchId) {
    const sucursal = await prisma.branch.findFirst({ where: { id: branchId, tenantId }, select: { id: true } })
    if (!sucursal) return error('La sucursal elegida no existe en la empresa.', 404)
  }
  if (await topeDePuentesAlcanzado(tenantId, prisma)) return error(`La empresa ya tiene ${MAX_PUENTES_POR_EMPRESA} puentes activos.`, 429)
  const { code, codeHash, expiresAt } = crearCodigoVinculacion()
  const puente = await prisma.$transaction(async tx => {
    const created = await tx.printBridge.create({
      data: { tenantId, name, branchId, tokenHash: hashToken(generarTokenPuente()), pairingCodeHash: codeHash, pairingExpiresAt: expiresAt, createdByUserId: session.user.id },
    })
    await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'PRINT_BRIDGE_CREATED', entity: 'PrintBridge', entityId: created.id, metadata: { name, ...(branchId ? { branchId } : {}) } } })
    return created
  })
  return json({ bridge: { id: puente.id, name: puente.name, branchId: puente.branchId }, pairingCode: code, expiresAt }, { status: 201 })
}
