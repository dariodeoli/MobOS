import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import {
  INVENTORY_PHYSICALLY_VERIFIED,
  INVENTORY_RESERVATION_EXPIRED,
  INVENTORY_RESERVATION_RELEASED,
  INVENTORY_RESERVED,
  INVENTORY_RESTORED,
  INVENTORY_TRANSIT_RECEIVED,
  INVENTORY_UNIT_ADJUSTED,
  INVENTORY_UNIT_DETAILS_UPDATED,
  INVENTORY_UNIT_MOVED,
  INVENTORY_UNIT_RECEIVED,
  INVENTORY_REMOVED,
} from '../../../../../lib/inventory'

type RouteContext = { params: { id: string } }

const ESTADO_ES: Record<string, string> = { AVAILABLE: 'disponible', RESERVED: 'reservado', SOLD: 'vendido', DEFECTIVE: 'en revisión', IN_TRANSIT: 'en tránsito' }
const ENTREGA_ES: Record<string, string> = { DELIVERED: 'entregado', READY_FOR_PICKUP: 'listo para retirar', IN_TRANSIT: 'en camino', READY_TO_SHIP: 'listo para enviar' }
const fechaHora = (value: unknown) => {
  const fecha = new Date(String(value))
  return Number.isNaN(fecha.getTime()) ? '' : fecha.toLocaleString('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '')
}

// Etiqueta y detalle legibles de cada evento: la cronología de la unidad se
// lee como un relato (ingresó, se verificó, se reservó para X, venció, se
// vendió, reingresó…) y no como el nombre crudo de la acción de auditoría.
function detalleDeEvento(action: string, metadata: unknown, locaciones: Map<string, string>): { label: string; detail: string } {
  const row = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {}
  const nombreUbicacion = (id: unknown) => (typeof id === 'string' && locaciones.get(id)) || ''
  const partes: string[] = []
  let label = ''
  switch (action) {
    case INVENTORY_UNIT_RECEIVED:
      label = 'Ingresó a stock'
      if (row.origin === 'alta-producto') partes.push('Alta del producto')
      break
    case INVENTORY_PHYSICALLY_VERIFIED:
      label = row.receivedInTransit ? 'Recibido y verificado' : 'Verificado físicamente'
      if (row.locationId) partes.push(nombreUbicacion(row.locationId))
      break
    case INVENTORY_RESERVED:
      label = 'Reservado'
      partes.push(String(row.customer || 'Sin cliente'))
      if (row.reservedUntil) partes.push(`vence ${fechaHora(row.reservedUntil)}`)
      break
    case INVENTORY_RESERVATION_RELEASED:
      label = 'Reserva liberada'
      if (row.customer) partes.push(String(row.customer))
      break
    case INVENTORY_RESERVATION_EXPIRED:
      label = 'Reserva vencida'
      partes.push(row.customer ? `estaba reservado para ${row.customer}` : 'volvió a estar disponible')
      break
    case INVENTORY_UNIT_MOVED: {
      label = 'Cambió de ubicación'
      const destino = nombreUbicacion(row.to) || 'Sin ubicación'
      const origen = nombreUbicacion(row.from)
      partes.push(origen ? `${origen} → ${destino}` : destino)
      break
    }
    case INVENTORY_UNIT_ADJUSTED: {
      const despues = (row.after as Record<string, unknown> | undefined)?.status
      label = despues === 'DEFECTIVE' ? 'Enviado a revisión' : despues === 'AVAILABLE' ? 'Habilitado' : 'Ajuste de estado'
      if (row.reason) partes.push(String(row.reason))
      break
    }
    case INVENTORY_REMOVED:
      label = 'Dado de baja'
      if (row.reason) partes.push(String(row.reason))
      break
    case INVENTORY_RESTORED:
      label = 'Restaurado a disponible'
      if (row.reason) partes.push(String(row.reason))
      break
    case INVENTORY_UNIT_DETAILS_UPDATED: {
      const costo = row.costo && typeof row.costo === 'object' && !Array.isArray(row.costo) ? row.costo as Record<string, unknown> : null
      if (costo) {
        label = 'Costo del equipo'
        if ((costo.costPyg === null || costo.costPyg === undefined) && (costo.originalCost === null || costo.originalCost === undefined)) partes.push('se quitó el costo (queda pendiente)')
        else {
          if (costo.costCurrency !== 'PYG' && costo.originalCost !== null && costo.originalCost !== undefined) partes.push(`${String(costo.costCurrency || 'PYG')} ${Number(costo.originalCost).toLocaleString('es-PY', { maximumFractionDigits: 2 })}`)
          if (costo.costPyg !== null && costo.costPyg !== undefined) partes.push(`Gs ${Number(costo.costPyg).toLocaleString('es-PY')}`)
          if (costo.costCurrency !== 'PYG' && costo.exchangeRatePyg !== null && costo.exchangeRatePyg !== undefined) partes.push(`cotización ${Number(costo.exchangeRatePyg).toLocaleString('es-PY', { maximumFractionDigits: 4 })}`)
        }
        break
      }
      label = 'Nota del dispositivo'
      if (row.notes) partes.push(`"${String(row.notes).slice(0, 220)}"`)
      else if (Array.isArray(row.campos) && row.campos.length) partes.push(`campos: ${row.campos.join(', ')}`)
      break
    }
    case INVENTORY_TRANSIT_RECEIVED:
      label = 'Recibido en sucursal'
      if (row.locationId) partes.push(nombreUbicacion(row.locationId))
      break
    default:
      label = action.replace(/_/g, ' ').toLowerCase()
  }
  if (!partes.length && row.reason) partes.push(String(row.reason))
  return { label, detail: partes.filter(Boolean).join(' · ') }
}

// Historial de una unidad por IMEI/serial: eventos de auditoría sobre la
// unidad (recepción, ajustes, bajas, ventas) y traslados entre sucursales
// cuyo listado de seriales la incluya. ADMIN ve cualquier unidad de su
// empresa; GERENTE solo las de su sucursal.
export async function GET(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE'].includes(session.user.role)) return error('No autorizado.', 403)
  const id = (params.id || '').trim().slice(0, 128)
  if (!id) return error('Unidad obligatoria.')

  const unit = await prisma.inventoryUnit.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { id: true, serial: true, status: true, productId: true, branchId: true, createdAt: true, product: { select: { name: true, sku: true } } },
  })
  if (!unit) return error('Unidad no encontrada.', 404)
  if (session.user.role === 'GERENTE' && unit.branchId !== session.user.branchId) return error('No autorizado para esa sucursal.', 403)

  const [auditEvents, transferRows, saleRows, commentRows, ubicaciones] = await Promise.all([
    prisma.auditLog.findMany({
      where: { tenantId: session.user.tenantId, entity: 'InventoryUnit', entityId: id },
      select: { id: true, action: true, createdAt: true, metadata: true, user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
      take: 500,
    }),
    prisma.$queryRaw<Array<{ id: string; transferId: string; quantity: number; serials: unknown; sourceBranchId: string; sourceBranchName: string; destinationBranchId: string; destinationBranchName: string; createdById: string; createdByName: string; notes: string | null; createdAt: Date }>>`
      SELECT l."id", l."transferId", l."quantity", l."serials",
             t."sourceBranchId", sb."name" AS "sourceBranchName",
             t."destinationBranchId", db."name" AS "destinationBranchName",
             t."createdById", u."name" AS "createdByName", t."notes", t."createdAt"
      FROM "StockTransferLine" l
      JOIN "StockTransfer" t ON t."id" = l."transferId"
      JOIN "Branch" sb ON sb."id" = t."sourceBranchId"
      JOIN "Branch" db ON db."id" = t."destinationBranchId"
      JOIN "User" u ON u."id" = t."createdById"
      WHERE t."tenantId" = ${session.user.tenantId}
        AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(l."serials") AS s WHERE s = ${unit.serial})
      ORDER BY t."createdAt" ASC
      LIMIT 500
    `,
    // Ventas de esta unidad por el espejo indexado de seriales: no depende de
    // escanear JSON ni de que el evento de auditoría siga existiendo.
    prisma.$queryRaw<Array<{ id: string; orderNumber: string; createdAt: Date; customerName: string | null; sellerName: string | null; status: string; fulfillmentStatus: string }>>`
      SELECT o."id", o."orderNumber", o."createdAt", c."name" AS "customerName", u."name" AS "sellerName", o."status"::text AS "status", o."fulfillmentStatus"::text AS "fulfillmentStatus"
      FROM "OrderItemSerial" s
      JOIN "OrderItem" i ON i."id" = s."orderItemId"
      JOIN "Order" o ON o."id" = i."orderId"
      LEFT JOIN "Customer" c ON c."id" = o."customerId"
      LEFT JOIN "User" u ON u."id" = o."sellerId"
      WHERE o."tenantId" = ${session.user.tenantId} AND s."serial" = ${unit.serial}
      ORDER BY o."createdAt" ASC
      LIMIT 500
    `,
    prisma.inventoryUnitComment.findMany({
      where: { tenantId: session.user.tenantId, unitId: unit.id },
      include: { user: { select: { id: true, name: true } }, photos: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    }),
    // Nombres de ubicación para que mover o recibir se lea con el lugar real.
    prisma.stockLocation.findMany({ where: { tenantId: session.user.tenantId }, select: { id: true, name: true }, take: 500 }),
  ])
  const locaciones = new Map(ubicaciones.map(ubicacion => [ubicacion.id, ubicacion.name]))

  const events = [
    ...auditEvents.map(event => {
      const { label, detail } = detalleDeEvento(event.action, event.metadata, locaciones)
      return {
        id: event.id,
        type: 'audit' as const,
        action: event.action,
        label,
        createdAt: event.createdAt,
        user: event.user ? { id: event.user.id, name: event.user.name } : null,
        detail,
      }
    }),
    ...transferRows.map(row => ({
      id: row.id,
      type: 'transfer' as const,
      action: 'STOCK_TRANSFERRED',
      label: 'Traslado',
      createdAt: row.createdAt,
      user: { id: row.createdById, name: row.createdByName },
      detail: `Traslado de ${row.sourceBranchName} a ${row.destinationBranchName}${row.notes ? ` (${row.notes})` : ''}`,
    })),
    ...saleRows.map(row => ({
      id: row.id,
      type: 'sale' as const,
      action: 'ORDER_SOLD',
      label: row.status === 'CANCELLED' ? 'Venta anulada' : 'Venta',
      createdAt: row.createdAt,
      user: row.sellerName ? { id: '', name: row.sellerName } : null,
      detail: `Venta ${row.orderNumber}${row.customerName ? ` · ${row.customerName}` : ''}${ENTREGA_ES[row.fulfillmentStatus] ? ` · ${ENTREGA_ES[row.fulfillmentStatus]}` : ''}`,
    })),
    ...commentRows.map(comment => ({
      id: comment.id,
      type: 'comment' as const,
      action: 'INVENTORY_UNIT_COMMENTED',
      label: 'Comentario',
      createdAt: comment.createdAt,
      user: comment.user ? { id: comment.user.id, name: comment.user.name } : null,
      detail: comment.body,
      photos: comment.photos,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return json({ unit, events })
}
