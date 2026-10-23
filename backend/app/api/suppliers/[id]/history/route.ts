import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { numero } from '../../../../../lib/montos'
import { paginaDeEventos } from '../../../../../lib/history-page'

type RouteContext = { params: Promise<{ id: string }> }

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
  ref?: { kind: string; id: string }
}

// Cronología del proveedor: compras con su total/estado, pagos y anticipos,
// unidades recibidas y auditoría de la ficha. GERENTE replica el alcance de
// /api/purchases y del balance: solo compras/unidades de su sucursal.
export async function GET(request: Request, props: RouteContext) {
  const params = await props.params;
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE'].includes(session.user.role)) return error('No autorizado.', 403)
  const tenant = session.user.tenantId
  const id = (params.id || '').trim().slice(0, 128)
  if (!id) return error('Proveedor obligatorio.')

  const supplier = await prisma.supplier.findFirst({ where: { id, tenantId: tenant }, select: { id: true, name: true, createdAt: true } })
  if (!supplier) return error('Proveedor no encontrado.', 404)

  const branchId = session.user.role === 'ADMIN' ? null : (session.user.branchId || '')
  const searchParams = new URL(request.url).searchParams
  const paginado = searchParams.has('limit')
  if (branchId === '') return json({ events: [], summary: { totalPurchasedPyg: 0, paidPyg: 0, returnedPyg: 0, outstandingPyg: 0, products: [] } })

  const [orders, units, audits, lineas] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { tenantId: tenant, supplierId: supplier.id, ...(branchId ? { branchId } : {}) },
      select: {
        id: true, status: true, createdAt: true, receivedAt: true, supplierReference: true,
        createdBy: { select: { id: true, name: true } },
        lines: { select: { finalTotalCostPyg: true } },
        payments: { select: { id: true, amountPyg: true, kind: true, reference: true, paidAt: true, createdAt: true, createdById: true } },
        returns: { select: { totalPyg: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: paginado ? 500 : 100,
    }),
    prisma.inventoryUnit.findMany({
      where: { tenantId: tenant, supplierId: supplier.id, ...(branchId ? { branchId } : {}) },
      select: { id: true, serial: true, costPyg: true, createdAt: true, product: { select: { name: true, sku: true } } },
      orderBy: { createdAt: 'desc' },
      take: paginado ? 500 : 100,
    }),
    prisma.auditLog.findMany({
      where: { tenantId: tenant, entity: 'Supplier', entityId: supplier.id },
      select: { id: true, action: true, metadata: true, createdAt: true, user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
    // Productos comprados a este proveedor (mismo alcance de sucursal).
    prisma.purchaseLine.findMany({
      where: { purchase: { tenantId: tenant, supplierId: supplier.id, ...(branchId ? { branchId } : {}) } },
      select: { productId: true, quantity: true, receivedQty: true, finalTotalCostPyg: true, product: { select: { name: true, sku: true } }, purchase: { select: { createdAt: true } } },
      take: 2000,
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
      const totalPyg = order.lines.reduce((sum, line) => sum + numero(line.finalTotalCostPyg), 0)
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
      return [compra, ...recibida, ...pagos].map(item => ({ ...item, ...(item.id.startsWith('payment-') ? {} : { ref: { kind: 'purchase', id: order.id } }) }))
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
  events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || String(a.id).localeCompare(String(b.id)))
  // Totales y productos comprados: saldo pendiente = comprado - pagado - devuelto.
  const totalPurchasedPyg = orders.reduce((sum, order) => sum + order.lines.reduce((acc, line) => acc + numero(line.finalTotalCostPyg), 0), 0)
  const paidPyg = orders.reduce((sum, order) => sum + order.payments.reduce((acc, payment) => acc + numero(payment.amountPyg), 0), 0)
  const returnedPyg = orders.reduce((sum, order) => sum + order.returns.reduce((acc, item) => acc + numero(item.totalPyg), 0), 0)
  const porProducto = new Map<string, { productId: string; name: string; sku: string; quantity: number; totalPyg: number; lastPurchasedAt: Date }>()
  for (const linea of lineas) {
    const actual = porProducto.get(linea.productId) || { productId: linea.productId, name: linea.product?.name || 'Producto', sku: linea.product?.sku || '', quantity: 0, totalPyg: 0, lastPurchasedAt: linea.purchase.createdAt }
    actual.quantity += linea.quantity
    actual.totalPyg += numero(linea.finalTotalCostPyg)
    if (linea.purchase.createdAt > actual.lastPurchasedAt) actual.lastPurchasedAt = linea.purchase.createdAt
    porProducto.set(linea.productId, actual)
  }
  const summary = {
    totalPurchasedPyg,
    paidPyg,
    returnedPyg,
    outstandingPyg: Math.max(0, totalPurchasedPyg - paidPyg - returnedPyg),
    products: [...porProducto.values()].sort((a, b) => b.totalPyg - a.totalPyg).slice(0, 50),
  }
  if (!paginado) return json({ events: events.slice(0, 300), summary })
  return json({ ...paginaDeEventos(events, searchParams), summary })
}
