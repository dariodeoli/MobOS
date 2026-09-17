import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'

type RouteContext = { params: { id: string } }

// Acciones conocidas del proveedor; el resto se muestra humanizado.
const ACCIONES_PROVEEDOR: Record<string, string> = {
  SUPPLIER_CREATED: 'Proveedor creado',
  SUPPLIER_UPDATED: 'Proveedor actualizado',
  SUPPLIER_ARCHIVED: 'Proveedor archivado',
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

// Cronología del proveedor: compras con su total/estado, pagos y anticipos,
// unidades recibidas y auditoría de la ficha. GERENTE replica el alcance de
// /api/purchases y del balance: solo compras/unidades de su sucursal.
export async function GET(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE'].includes(session.user.role)) return error('No autorizado.', 403)
  const tenant = session.user.tenantId
  const id = (params.id || '').trim().slice(0, 128)
  if (!id) return error('Proveedor obligatorio.')

  const supplier = await prisma.supplier.findFirst({ where: { id, tenantId: tenant }, select: { id: true, name: true, createdAt: true } })
  if (!supplier) return error('Proveedor no encontrado.', 404)

  const branchId = session.user.role === 'ADMIN' ? null : (session.user.branchId || '')
  if (branchId === '') return json({ events: [] })

  const [orders, units, audits] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { tenantId: tenant, supplierId: supplier.id, ...(branchId ? { branchId } : {}) },
      select: {
        id: true, status: true, createdAt: true, receivedAt: true, supplierReference: true,
        createdBy: { select: { id: true, name: true } },
        lines: { select: { finalTotalCostPyg: true } },
        payments: { select: { id: true, amountPyg: true, kind: true, reference: true, paidAt: true, createdAt: true, createdById: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.inventoryUnit.findMany({
      where: { tenantId: tenant, supplierId: supplier.id, ...(branchId ? { branchId } : {}) },
      select: { id: true, serial: true, costPyg: true, createdAt: true, product: { select: { name: true, sku: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.auditLog.findMany({
      where: { tenantId: tenant, entity: 'Supplier', entityId: supplier.id },
      select: { id: true, action: true, metadata: true, createdAt: true, user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
  ])

  // PurchasePayment no tiene relación con User: los nombres se resuelven aparte.
  const paymentUserIds = [...new Set(orders.flatMap(order => order.payments.map(payment => payment.createdById)))]
  const paymentUsers = paymentUserIds.length
    ? await prisma.user.findMany({ where: { tenantId: tenant, id: { in: paymentUserIds } }, select: { id: true, name: true } })
    : []
  const userById = new Map(paymentUsers.map(user => [user.id, user]))

  const events: TimelineEvent[] = [
    ...orders.flatMap(order => {
      const totalPyg = order.lines.reduce((sum, line) => sum + line.finalTotalCostPyg, 0)
      const compra: TimelineEvent = {
        id: `purchase-${order.id}`,
        type: 'purchase',
        action: 'Compra registrada',
        createdAt: order.createdAt,
        user: order.createdBy,
        detail: `Gs ${gs(totalPyg)} · ${order.lines.length} línea${order.lines.length === 1 ? '' : 's'}${order.supplierReference ? ` · ${order.supplierReference}` : ''} · ${order.status === 'RECEIVED' ? 'Recibida' : 'Borrador'}`,
      }
      const recibida: TimelineEvent[] = order.receivedAt ? [{
        id: `purchase-${order.id}-received`,
        type: 'purchase',
        action: 'Compra recibida',
        createdAt: order.receivedAt,
        user: order.createdBy,
        detail: `${order.supplierReference || `Compra ${order.id}`} · Gs ${gs(totalPyg)}`,
      }] : []
      const pagos: TimelineEvent[] = order.payments.map(payment => ({
        id: `payment-${payment.id}`,
        type: 'payment',
        action: payment.kind === 'ADVANCE' ? 'Anticipo a proveedor' : 'Pago a proveedor',
        createdAt: payment.paidAt || payment.createdAt,
        user: userById.get(payment.createdById) || null,
        detail: `Gs ${gs(payment.amountPyg)}${payment.reference ? ` · ${payment.reference}` : ''} · ${order.supplierReference || `compra ${order.id}`}`,
      }))
      return [compra, ...recibida, ...pagos]
    }),
    ...units.map(unit => ({
      id: `unit-${unit.id}`,
      type: 'unit',
      action: 'Unidad recibida',
      createdAt: unit.createdAt,
      user: null,
      detail: `Serial ${unit.serial} · ${unit.product?.name || unit.product?.sku || 'Producto'}${unit.costPyg ? ` · Gs ${gs(unit.costPyg)}` : ''}`,
    })),
    ...audits.map(audit => ({
      id: `audit-${audit.id}`,
      type: 'supplier',
      action: ACCIONES_PROVEEDOR[audit.action] || audit.action.replace(/_/g, ' ').toLowerCase(),
      createdAt: audit.createdAt,
      user: audit.user,
      detail: detalleMetadata(audit.metadata),
    })),
  ]
  events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return json({ events: events.slice(0, 300) })
}
