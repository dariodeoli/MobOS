import { requireSession } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { prisma } from '../../../../lib/prisma'
import { InputError } from '../../../../lib/payment-input'
import { normalizarImpresora, remoteEnabledDeTenant, shapePuente } from '../../../../lib/print-bridge'

// Configuración de impresión de la empresa: impresoras, puentes activos y el
// estado del encolado remoto (kill switch por empresa).
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const tenantId = session.user.tenantId
  const [printers, bridges, tenant] = await Promise.all([
    prisma.printPrinter.findMany({ where: { tenantId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] }),
    prisma.printBridge.findMany({ where: { tenantId, revokedAt: null }, orderBy: { createdAt: 'asc' } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }),
  ])
  return json({ printers, bridges: bridges.map(puente => shapePuente(puente)), remoteEnabled: remoteEnabledDeTenant(tenant?.settings) })
}

// Alta de impresora (solo ADMIN). El destino es único por empresa.
export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('No autorizado.', 403)
  const tenantId = session.user.tenantId
  const body = await request.json().catch(() => null)
  let impresora
  try {
    impresora = normalizarImpresora(body)
  } catch (cause) {
    return error(cause instanceof InputError ? cause.message : 'Datos de impresora inválidos.', cause instanceof InputError ? cause.status : 400)
  }
  if (impresora.bridgeId) {
    const puente = await prisma.printBridge.findFirst({ where: { id: impresora.bridgeId, tenantId, revokedAt: null }, select: { id: true } })
    if (!puente) return error('El puente elegido no existe o está revocado.')
  }
  try {
    const creada = await prisma.$transaction(async tx => {
      if (impresora.isDefault) await tx.printPrinter.updateMany({ where: { tenantId, isDefault: true }, data: { isDefault: false } })
      const nueva = await tx.printPrinter.create({ data: { ...impresora, tenantId } })
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: session.user.id,
          action: 'PRINT_PRINTER_CREATED',
          entity: 'PrintPrinter',
          entityId: nueva.id,
          metadata: { name: nueva.name, destination: nueva.destination, connection: nueva.connection, isDefault: nueva.isDefault, isActive: nueva.isActive },
        },
      })
      return nueva
    })
    return json(creada, { status: 201 })
  } catch (cause) {
    if ((cause as { code?: string })?.code === 'P2002') return error('Ya existe una impresora con ese destino en la empresa.', 409)
    return error('No se pudo guardar la impresora.', 500)
  }
}
