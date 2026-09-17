import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'

type RouteContext = { params: { id: string } }

const UNIT_STATUS: Record<string, string> = { AVAILABLE: 'Disponible', RESERVED: 'Reservado', SOLD: 'Vendido', DEFECTIVE: 'En revisión', IN_TRANSIT: 'En tránsito' }

// Acciones conocidas de la unidad; el resto se muestra humanizado.
const ACCIONES_UNIDAD: Record<string, string> = {
  INVENTORY_UNIT_RECEIVED: 'Unidad recibida',
  INVENTORY_UNIT_MOVED: 'Unidad movida',
  INVENTORY_UNIT_ADJUSTED: 'Unidad ajustada',
  INVENTORY_REMOVED: 'Unidad dada de baja',
  INVENTORY_RESTORED: 'Unidad restaurada',
  INVENTORY_RESERVED: 'Unidad reservada',
  INVENTORY_RESERVATION_RELEASED: 'Reserva liberada',
  INVENTORY_UNIT_COMMENTED: 'Comentario de unidad',
  INVENTORY_TRANSIT_RECEIVED: 'Unidad recibida en tránsito',
}

const gs = (value: unknown) => Number(value || 0).toLocaleString('es-PY')

// Resumen legible de la metadata de auditoría (nunca se devuelve el JSON crudo).
function detalleMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') return ''
  return Object.entries(metadata as Record<string, unknown>)
    .map(([clave, valor]) => `${clave}: ${valor !== null && typeof valor === 'object' ? JSON.stringify(valor) : String(valor)}`)
    .join(' · ')
    .slice(0, 300)
}

type TimelineEvent = {
  id: string
  type: string
  action: string
  createdAt: Date
  user: { id: string; name: string } | null
  detail: string
}

// Cronología del producto: alta, auditoría (stock, precio, costo), unidades
// serializadas con sus eventos, y compras del catálogo. No existe historial de
// precios propio, así que los cambios de precio salen de la auditoría.
// Mismo alcance de sucursal que GET /api/products: VENDEDOR/CAJERA solo ven
// productos de su sucursal (o generales sin sucursal).
export async function GET(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE', 'VENDEDOR', 'CAJERA'].includes(session.user.role)) return error('No autorizado.', 403)
  const tenant = session.user.tenantId
  const id = (params.id || '').trim().slice(0, 128)
  if (!id) return error('Producto obligatorio.')

  const product = await prisma.product.findFirst({
    where: { id, tenantId: tenant, isActive: true },
    select: { id: true, sku: true, name: true, createdAt: true, branchId: true },
  })
  if (!product) return error('Producto no encontrado.', 404)
  if (['VENDEDOR', 'CAJERA'].includes(session.user.role) && product.branchId && product.branchId !== session.user.branchId) return error('No autorizado para esa sucursal.', 403)

  const [audits, units, purchaseLines] = await Promise.all([
    prisma.auditLog.findMany({
      where: { tenantId: tenant, entity: 'Product', entityId: product.id },
      select: { id: true, action: true, metadata: true, createdAt: true, user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
    prisma.inventoryUnit.findMany({
      where: { tenantId: tenant, productId: product.id },
      select: { id: true, serial: true, status: true, supplierName: true, costPyg: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.purchaseLine.findMany({
      where: { productId: product.id, purchase: { tenantId: tenant } },
      select: {
        id: true, quantity: true, unitCostPyg: true, finalUnitCostPyg: true, finalTotalCostPyg: true, lotReference: true,
        purchase: { select: { id: true, supplierName: true, status: true, createdAt: true, receivedAt: true, createdBy: { select: { id: true, name: true } } } },
      },
      orderBy: { purchase: { createdAt: 'desc' } },
      take: 100,
    }),
  ])
  const unitIds = units.map(unit => unit.id)
  const unitAudits = unitIds.length
    ? await prisma.auditLog.findMany({
        where: { tenantId: tenant, entity: 'InventoryUnit', entityId: { in: unitIds } },
        select: { id: true, entityId: true, action: true, metadata: true, createdAt: true, user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 300,
      })
    : []
  const serialById = new Map(units.map(unit => [unit.id, unit.serial]))

  const events: TimelineEvent[] = [
    {
      id: `product-${product.id}`,
      type: 'product',
      action: 'Producto creado',
      createdAt: product.createdAt,
      user: null,
      detail: `${product.sku} · ${product.name}`,
    },
    ...audits.map(audit => ({
      id: `audit-${audit.id}`,
      type: /PRICE/.test(audit.action) ? 'price' : 'audit',
      action: /PRICE/.test(audit.action) ? 'Precio actualizado' : audit.action.replace(/_/g, ' ').toLowerCase(),
      createdAt: audit.createdAt,
      user: audit.user,
      detail: detalleMetadata(audit.metadata),
    })),
    ...units.map(unit => ({
      id: `unit-${unit.id}`,
      type: 'unit',
      action: 'Unidad registrada',
      createdAt: unit.createdAt,
      user: null,
      detail: `Serial ${unit.serial} · ${UNIT_STATUS[unit.status] || unit.status}${unit.supplierName ? ` · ${unit.supplierName}` : ''}${unit.costPyg ? ` · Gs ${gs(unit.costPyg)}` : ''}`,
    })),
    ...unitAudits.map(audit => ({
      id: `unit-audit-${audit.id}`,
      type: 'unit',
      action: ACCIONES_UNIDAD[audit.action] || audit.action.replace(/_/g, ' ').toLowerCase(),
      createdAt: audit.createdAt,
      user: audit.user,
      detail: `${serialById.get(audit.entityId || '') ? `Serial ${serialById.get(audit.entityId || '')} · ` : ''}${detalleMetadata(audit.metadata)}`,
    })),
    ...purchaseLines.map(line => ({
      id: `purchase-${line.id}`,
      type: 'purchase',
      action: line.purchase.status === 'RECEIVED' ? 'Compra recibida' : 'Compra registrada',
      createdAt: line.purchase.receivedAt || line.purchase.createdAt,
      user: line.purchase.createdBy,
      detail: `${line.purchase.supplierName} · ${line.quantity} unid. · Gs ${gs(line.finalTotalCostPyg || line.quantity * (line.finalUnitCostPyg || line.unitCostPyg))}${line.lotReference ? ` · lote ${line.lotReference}` : ''} · ${line.purchase.status === 'RECEIVED' ? 'Recibida' : 'Borrador'}`,
    })),
  ]
  events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return json({ events: events.slice(0, 300) })
}
