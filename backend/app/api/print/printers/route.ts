import { requireSession } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { prisma } from '../../../../lib/prisma'
import { InputError } from '../../../../lib/payment-input'
import { normalizarImpresora, remoteEnabledDeTenant, shapePuente } from '../../../../lib/print-bridge'
import { resumenImpresora } from '../../../../lib/print-audit'

// La sucursal elegida tiene que ser de la empresa: un id ajeno no se guarda.
async function sucursalDelTenant(tenantId: string, branchId: string | null): Promise<string | null> {
  if (!branchId) return null
  const sucursal = await prisma.branch.findFirst({ where: { id: branchId, tenantId }, select: { id: true } })
  if (!sucursal) throw new InputError('La sucursal elegida no existe en la empresa.', 404)
  return sucursal.id
}

// Ventana de la alerta del panel: una sucursal "con ventas" es la que vendió en
// los últimos 30 días. Sin ventas recientes, la falta de puente no alerta.
const VENTAS_DIAS = 30

// Configuración de impresión de la empresa: impresoras, puentes activos y el
// estado del encolado remoto (kill switch por empresa).
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const tenantId = session.user.tenantId
  const desde = new Date(Date.now() - VENTAS_DIAS * 24 * 60 * 60 * 1000)
  const [printers, bridges, tenant, branches, ventas] = await Promise.all([
    prisma.printPrinter.findMany({ where: { tenantId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] }),
    prisma.printBridge.findMany({ where: { tenantId, revokedAt: null }, orderBy: { createdAt: 'asc' } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }),
    prisma.branch.findMany({ where: { tenantId }, select: { id: true, name: true, isActive: true }, orderBy: { name: 'asc' } }),
    prisma.order.groupBy({ by: ['branchId'], where: { tenantId, createdAt: { gte: desde }, status: { not: 'CANCELLED' } }, _count: { _all: true } }),
  ])
  const conVentas = new Set(ventas.map(fila => fila.branchId).filter((id): id is string => Boolean(id)))
  return json({
    printers,
    bridges: bridges.map(puente => shapePuente(puente)),
    remoteEnabled: remoteEnabledDeTenant(tenant?.settings),
    branches: branches.map(sucursal => ({ ...sucursal, hasSales: conVentas.has(sucursal.id) })),
  })
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
    const branchId = await sucursalDelTenant(tenantId, impresora.branchId)
    const creada = await prisma.$transaction(async tx => {
      if (impresora.isDefault) await tx.printPrinter.updateMany({ where: { tenantId, isDefault: true }, data: { isDefault: false } })
      const nueva = await tx.printPrinter.create({ data: { ...impresora, branchId, tenantId } })
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: session.user.id,
          action: 'PRINT_PRINTER_CREATED',
          entity: 'PrintPrinter',
          entityId: nueva.id,
          metadata: { ...resumenImpresora(nueva), bridgeId: nueva.bridgeId ?? null },
        },
      })
      return nueva
    })
    return json(creada, { status: 201 })
  } catch (cause) {
    if (cause instanceof InputError) return error(cause.message, cause.status)
    if ((cause as { code?: string })?.code === 'P2002') return error('Ya existe una impresora con ese destino en la empresa.', 409)
    return error('No se pudo guardar la impresora.', 500)
  }
}
