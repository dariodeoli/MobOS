import { prisma } from '../../../../lib/prisma'
import { error, json, tenantId } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { serialKey } from '../../../../lib/validation'
import { changeStock } from '../../../../lib/stock'
import { INVENTORY_PHYSICALLY_VERIFIED } from '../../../../lib/inventory'
import { canUndoVerification } from '../../../../lib/stock-verification'
import { reservaDeAsignacion, vincularAsignacionAlRecibir } from '../../../../lib/transit'

const branchAllowed = (role: string, assigned: string | null, branchId: string | null) => !['VENDEDOR', 'CAJERA'].includes(role) || assigned === branchId
const text = (value: unknown, max = 128) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null

// La verificación deja evidencia de quién confirmó físicamente cada unidad.
// Cuando la unidad viene en tránsito, el check del vendedor/encargado en destino
// es además la recepción: la unidad pasa a disponible, se asigna a una ubicación
// (Depósito 1, Depósito 2, Piso de venta…) y recién ahí suma al stock del local.
export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  let body: any; try { body = await request.json() } catch { return error('JSON inválido.') }
  const serials = (Array.isArray(body.serials) ? body.serials : [body.serial]).map(serialKey).filter(Boolean)
  if (!serials.length || serials.length > 100 || new Set(serials).size !== serials.length) return error('Indicá entre 1 y 100 IMEI/seriales distintos.')
  const locationId = body.locationId === undefined || body.locationId === null || body.locationId === '' ? null : text(body.locationId)
  if (body.locationId !== undefined && body.locationId !== null && body.locationId !== '' && !locationId) return error('Ubicación inválida.')
  if (locationId && serials.length > 1) return error('Para asignar ubicación, verificá una sola unidad por vez.')
  const now = new Date()
  try {
    const result = await prisma.$transaction(async tx => {
      const units = await tx.inventoryUnit.findMany({ where: { tenantId: tenant, serial: { in: serials }, status: { not: 'SOLD' } }, select: { id: true, serial: true, branchId: true, status: true, productId: true, locationId: true, lastVerifiedAt: true, lastVerifiedById: true, verificationCount: true } })
      if (units.length !== serials.length) throw new Error('Uno o más equipos no existen, ya fueron vendidos o no se pueden verificar.')
      if (units.some(unit => !branchAllowed(session.user.role, session.user.branchId, unit.branchId))) throw new Error('No autorizado para verificar equipos de otra sucursal.')
      let received = 0
      let vinculadas = 0
      for (const unit of units) {
        if (locationId && !(await tx.stockLocation.findFirst({ where: { id: locationId, tenantId: tenant, branchId: unit.branchId ?? undefined, isActive: true }, select: { id: true } }))) throw new Error('Ubicación no encontrada para la sucursal del equipo.')
        const arriving = unit.status === 'IN_TRANSIT'
        // #279 (A4): si la unidad futura estaba apartada para una venta, al
        // llegar queda reservada a ese cliente (no se ofrece a otro vendedor) y
        // el IMEI se vincula al pedido que la esperaba.
        const asignacion = arriving
          ? await tx.transitAssignment.findFirst({ where: { tenantId: tenant, unitId: unit.id, status: 'ASIGNADA' }, orderBy: { createdAt: 'desc' } })
          : null
        await tx.inventoryUnit.update({ where: { id: unit.id }, data: {
          lastVerifiedAt: now, lastVerifiedById: session.user.id, verificationCount: { increment: 1 },
          ...(arriving
            ? { ...reservaDeAsignacion(asignacion), locationId: locationId ?? null, reservedUntil: null }
            : locationId ? { locationId } : {}),
        } })
        if (arriving) {
          received += 1
          await changeStock(tx, { tenantId: tenant, productId: unit.productId, delta: 1, message: 'El stock cambió mientras se recibía el equipo.' })
          await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_TRANSIT_RECEIVED', entity: 'InventoryUnit', entityId: unit.id, metadata: { serial: unit.serial, branchId: unit.branchId, locationId } } })
          if (asignacion && await vincularAsignacionAlRecibir(tx, { tenantId: tenant, unit, userId: session.user.id })) vinculadas += 1
        }
      }
      // El traslado se cierra cuando llegó su última unidad: así deja de
      // figurar como abierto y queda la fecha real de recepción.
      if (received) {
        const sucursales = [...new Set(units.filter(unit => unit.status === 'IN_TRANSIT').map(unit => unit.branchId).filter(Boolean))] as string[]
        const abiertos = sucursales.length
          ? await tx.stockTransfer.findMany({ where: { tenantId: tenant, receivedAt: null, destinationBranchId: { in: sucursales } }, select: { id: true, lines: { select: { serials: true } } } })
          : []
        for (const transfer of abiertos) {
          const delTraslado = transfer.lines.flatMap(line => Array.isArray(line.serials) ? line.serials as string[] : [])
          if (!delTraslado.length || !delTraslado.some(serial => serials.includes(serial))) continue
          const pendientes = await tx.inventoryUnit.count({ where: { tenantId: tenant, serial: { in: delTraslado }, status: 'IN_TRANSIT' } })
          if (pendientes > 0) continue
          await tx.stockTransfer.update({ where: { id: transfer.id }, data: { receivedAt: now, receivedById: session.user.id } })
          await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'STOCK_TRANSFER_RECEIVED', entity: 'StockTransfer', entityId: transfer.id, metadata: { serials: delTraslado } } })
        }
      }
      // Un evento por unidad: la cronología de cada equipo muestra quién la
      // verificó físicamente, cuándo y dónde quedó.
      await tx.auditLog.createMany({
        data: units.map(unit => {
          const llegoEnTransito = unit.status === 'IN_TRANSIT'
          return {
            tenantId: tenant,
            userId: session.user.id,
            action: INVENTORY_PHYSICALLY_VERIFIED,
            entity: 'InventoryUnit',
            entityId: unit.id,
            metadata: {
              serial: unit.serial,
              verifiedAt: now.toISOString(),
              // Para deshacer el check dentro del minuto (DELETE de esta ruta).
              previous: { at: unit.lastVerifiedAt?.toISOString() ?? null, byId: unit.lastVerifiedById ?? null, count: unit.verificationCount },
              locationId: llegoEnTransito ? locationId : unit.locationId ?? null,
              ...(llegoEnTransito ? { receivedInTransit: true } : {}),
            },
          }
        }),
      })
      return { verified: units.length, receivedInTransit: received, verifiedAt: now.toISOString(), serials: units.map(unit => unit.serial) }
    })
    return json(result)
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo registrar la verificación.', 409) }
}

// Deshacer el check de una fila: solo quien verificó, dentro del minuto y si nadie
// volvió a verificar la unidad. Restaura quién/cuándo anterior y deja el evento en la cronología.
export async function DELETE(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  let body: any; try { body = await request.json() } catch { return error('JSON inválido.') }
  const serial = serialKey(body.serial)
  if (!serial) return error('Indicá el IMEI/serial.')
  try {
    const result = await prisma.$transaction(async tx => {
      const unit = await tx.inventoryUnit.findFirst({ where: { tenantId: tenant, serial, status: { not: 'SOLD' } }, select: { id: true, branchId: true, lastVerifiedAt: true, lastVerifiedById: true, verificationCount: true } })
      if (!unit) throw new Error('El equipo no existe o ya fue vendido.')
      if (!branchAllowed(session.user.role, session.user.branchId, unit.branchId)) throw new Error('No autorizado para deshacer la verificación de otra sucursal.')
      const evento = await tx.auditLog.findFirst({ where: { tenantId: tenant, entity: 'InventoryUnit', entityId: unit.id, action: INVENTORY_PHYSICALLY_VERIFIED, userId: session.user.id }, orderBy: { createdAt: 'desc' } })
      const meta = (evento?.metadata ?? {}) as { verifiedAt?: string; previous?: { at: string | null; byId: string | null; count: number }; receivedInTransit?: boolean }
      if (!evento || meta.receivedInTransit || !meta.previous) throw new Error('Esta verificación no se puede deshacer.')
      if (!canUndoVerification({ verifiedAt: unit.lastVerifiedAt, verifiedById: unit.lastVerifiedById, userId: session.user.id, auditAt: meta.verifiedAt ?? null })) throw new Error('Solo se puede deshacer tu verificación durante el primer minuto.')
      await tx.inventoryUnit.update({ where: { id: unit.id }, data: { lastVerifiedAt: meta.previous.at ? new Date(meta.previous.at) : null, lastVerifiedById: meta.previous.byId, verificationCount: Math.max(0, meta.previous.count ?? 0) } })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_VERIFICATION_UNDONE', entity: 'InventoryUnit', entityId: unit.id, metadata: { serial, undoneAt: new Date().toISOString() } } })
      return { undone: true, serial, lastVerifiedAt: meta.previous.at, lastVerifiedById: meta.previous.byId }
    })
    return json(result)
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo deshacer la verificación.', 409) }
}
