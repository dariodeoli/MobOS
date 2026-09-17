import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'

type RouteContext = { params: { id: string } }

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

  const [auditEvents, transferRows, commentRows] = await Promise.all([
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
    prisma.inventoryUnitComment.findMany({
      where: { tenantId: session.user.tenantId, unitId: unit.id },
      include: { user: { select: { id: true, name: true } }, photos: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    }),
  ])

  const events = [
    ...auditEvents.map(event => ({
      id: event.id,
      type: 'audit' as const,
      action: event.action,
      createdAt: event.createdAt,
      user: event.user ? { id: event.user.id, name: event.user.name } : null,
      detail: auditDetail(event.action, event.metadata),
    })),
    ...transferRows.map(row => ({
      id: row.id,
      type: 'transfer' as const,
      action: 'STOCK_TRANSFERRED',
      createdAt: row.createdAt,
      user: { id: row.createdById, name: row.createdByName },
      detail: `Traslado de ${row.sourceBranchName} a ${row.destinationBranchName}${row.notes ? ` (${row.notes})` : ''}`,
    })),
    ...commentRows.map(comment => ({
      id: comment.id,
      type: 'comment' as const,
      action: 'INVENTORY_UNIT_COMMENTED',
      createdAt: comment.createdAt,
      user: comment.user ? { id: comment.user.id, name: comment.user.name } : null,
      detail: comment.body,
      photos: comment.photos,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return json({ unit, events })
}

function auditDetail(action: string, metadata: unknown) {
  const detail = action.replace(/_/g, ' ').toLowerCase()
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return detail
  const row = metadata as Record<string, unknown>
  const reason = typeof row.reason === 'string' && row.reason ? `: ${row.reason}` : ''
  return `${detail}${reason}`
}
