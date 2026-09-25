import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { serialKey } from '../../../../../lib/validation'
import { INVENTORY_REPAIR_APPLIED } from '../../../../../lib/inventory'

// #240 (repuestos no-OEM) · Vínculo orden de servicio ↔ unidad de stock.
//
// El taller carga el costo de la reparación en la orden (repuestos + mano de
// obra + otros). Cuando el equipo es parte del stock (el serial coincide con una
// unidad de la empresa), este endpoint pasa ese costo al **costo real de la
// unidad** (`inspection.costoRepuestosPyg`), que es la base que ya consumen el
// margen y el seguro (#148 §19). El vínculo se guarda en la orden y queda
// auditado en ambas fichas; se aplica una sola vez por orden.
const canManageBranch = (role: string, assigned: string | null, branchId: string | null) => role === 'ADMIN' || (role === 'GERENTE' && (!branchId || assigned === branchId))

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const tenant = session.user.tenantId
  let body: any
  try { body = await request.json() } catch { return error('JSON inválido.') }
  const serviceOrderId = typeof body?.serviceOrderId === 'string' && body.serviceOrderId.trim() ? body.serviceOrderId.trim().slice(0, 128) : null
  if (!serviceOrderId) return error('Indicá la orden de servicio a aplicar.')

  const unit = await prisma.inventoryUnit.findFirst({
    where: { id, tenantId: tenant },
    select: { id: true, serial: true, branchId: true, inspection: true },
  })
  if (!unit) return error('Unidad no encontrada.', 404)
  if (!canManageBranch(session.user.role, session.user.branchId, unit.branchId)) return error('No autorizado para editar el costo de esta unidad.', 403)

  const orden = await prisma.serviceOrder.findFirst({
    where: { id: serviceOrderId, tenantId: tenant },
    select: { id: true, serial: true, serviceNumber: true, device: true, costPyg: true, repairsAppliedAt: true, inventoryUnitId: true },
  })
  if (!orden) return error('Orden de servicio no encontrada.', 404)
  if (!orden.serial || serialKey(orden.serial) !== serialKey(unit.serial)) return error('El serial de la orden no coincide con el de la unidad.', 409)
  if (orden.repairsAppliedAt || orden.inventoryUnitId === unit.id) return error('El costo de esta orden ya se pasó al costo real de la unidad.', 409)

  const montoPyg = Number(orden.costPyg) || 0
  if (montoPyg <= 0) return error('La orden no tiene costo cargado: completá repuestos, mano de obra u otros antes de aplicarlo.')

  const inspeccion = unit.inspection && typeof unit.inspection === 'object' && !Array.isArray(unit.inspection) ? unit.inspection as Record<string, unknown> : {}
  const costoPrevio = Number(inspeccion.costoRepuestosPyg) || 0
  const marca = [orden.serviceNumber, orden.device].filter(Boolean).join(' · ') || 'Orden de servicio'
  const repuestos = [typeof inspeccion.repuestosNoOem === 'string' ? inspeccion.repuestosNoOem.trim() : '', marca].filter(Boolean).join('\n')
  const nota = [typeof inspeccion.repuestosNoOemNota === 'string' ? inspeccion.repuestosNoOemNota.trim() : '', `Costo de ${marca} aplicado al costo real de la unidad.`].filter(Boolean).join('\n')
  const ahora = new Date()

  let costoRepuestosPyg = 0
  let inspeccionActualizada: unknown = null
  try {
    inspeccionActualizada = await prisma.$transaction(async tx => {
      // El vínculo se reclama una sola vez: dos clics simultáneos no suman dos veces.
      const claim = await tx.serviceOrder.updateMany({ where: { id: orden.id, tenantId: tenant, repairsAppliedAt: null }, data: { inventoryUnitId: unit.id, repairsAppliedAt: ahora } })
      if (claim.count !== 1) throw new Error('ya-aplicada')
      const actualizada = await tx.inventoryUnit.update({
        where: { id: unit.id },
        data: { inspection: { ...inspeccion, repuestosNoOem: repuestos, repuestosNoOemNota: nota, costoRepuestosPyg: costoPrevio + montoPyg } as any },
        select: { inspection: true },
      })
      await tx.auditLog.create({
        data: {
          tenantId: tenant,
          userId: session.user.id,
          action: INVENTORY_REPAIR_APPLIED,
          entity: 'InventoryUnit',
          entityId: unit.id,
          metadata: { serviceOrderId: orden.id, serviceNumber: orden.serviceNumber, montoPyg, costoPrevioPyg: costoPrevio, costoRepuestosPyg: costoPrevio + montoPyg, serial: unit.serial },
        },
      })
      await tx.auditLog.create({
        data: {
          tenantId: tenant,
          userId: session.user.id,
          action: 'SERVICE_ORDER_COST_APPLIED',
          entity: 'ServiceOrder',
          entityId: orden.id,
          metadata: { inventoryUnitId: unit.id, serial: unit.serial, montoPyg },
        },
      })
      return actualizada.inspection
    })
    costoRepuestosPyg = costoPrevio + montoPyg
  } catch (cause) {
    if (cause instanceof Error && cause.message === 'ya-aplicada') return error('El costo de esta orden ya se pasó al costo real de la unidad.', 409)
    return error('No se pudo aplicar el costo de la reparación.', 409)
  }

  return json({ ok: true, unitId: unit.id, serviceOrderId: orden.id, montoPyg, costoRepuestosPyg, appliedAt: ahora.toISOString(), inspection: inspeccionActualizada })
}
