import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'

type RouteContext = { params: { id: string } }

const gs = (value: unknown) => Number(value || 0).toLocaleString('es-PY')

const ACCIONES: Record<string, string> = {
  PURCHASE_CREATED: 'Compra creada',
  PURCHASE_RECEIVED: 'Compra recibida',
  PURCHASE_PAYMENT_RECORDED: 'Pago a proveedor',
  PURCHASE_ADVANCE: 'Anticipo a proveedor',
  PURCHASE_COSTS_UPDATED: 'Costo de línea actualizado',
  PURCHASE_UPDATED: 'Compra actualizada',
}

// Acciones con evento propio (fila, pago, adjunto o costo): no se repiten desde
// la auditoría para no duplicar el mismo movimiento en la cronología.
const CON_EVENTO_PROPIO = new Set(['PURCHASE_CREATED', 'PURCHASE_RECEIVED', 'PURCHASE_PAYMENT_RECORDED', 'PURCHASE_ADVANCE', 'PURCHASE_COSTS_UPDATED'])

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

// Cronología de la compra: alta, cambios de costo por línea, recepción con la
// suma de stock, pagos/anticipos, adjuntos (factura y comprobantes de pago) y
// auditoría. Mismo alcance que /api/purchases: ADMIN todo; GERENTE su sucursal.
export async function GET(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE'].includes(session.user.role)) return error('No autorizado.', 403)
  const tenant = session.user.tenantId
  const id = (params.id || '').trim().slice(0, 128)
  if (!id) return error('Compra obligatoria.')

  const purchase = await prisma.purchaseOrder.findFirst({
    where: { id, tenantId: tenant },
    select: {
      id: true, supplierName: true, supplierReference: true, status: true, createdAt: true, receivedAt: true, branchId: true,
      createdBy: { select: { id: true, name: true } },
      lines: { select: { id: true, productId: true, quantity: true, unitCostPyg: true, finalTotalCostPyg: true, product: { select: { name: true, sku: true } } } },
    },
  })
  if (!purchase) return error('Compra no encontrada.', 404)
  if (session.user.role === 'GERENTE' && session.user.branchId && purchase.branchId !== session.user.branchId) return error('No autorizado para esa sucursal.', 403)

  const payments = await prisma.purchasePayment.findMany({
    where: { tenantId: tenant, purchaseId: purchase.id },
    select: { id: true, amountPyg: true, currency: true, originalAmount: true, exchangeRatePyg: true, reference: true, kind: true, paidAt: true, createdAt: true, createdById: true, account: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })

  const lineIds = purchase.lines.map(line => line.id)
  const paymentIds = payments.map(payment => payment.id)
  const [attachments, audits, paymentUsers] = await Promise.all([
    prisma.attachment.findMany({
      where: { tenantId: tenant, OR: [
        { entity: 'PURCHASE', entityId: purchase.id },
        ...(paymentIds.length ? [{ entity: 'SUPPLIER_PAYMENT', entityId: { in: paymentIds } }] : []),
      ] },
      select: { id: true, entity: true, fileName: true, createdAt: true, createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
    prisma.auditLog.findMany({
      where: { tenantId: tenant, OR: [
        { entity: { in: ['PurchaseOrder', 'Purchase'] }, entityId: purchase.id },
        { entity: 'PurchaseLine', entityId: { in: lineIds } },
      ] },
      select: { id: true, action: true, metadata: true, createdAt: true, user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
    // PurchasePayment no tiene relación con User: los nombres se resuelven aparte.
    payments.length
      ? prisma.user.findMany({ where: { tenantId: tenant, id: { in: [...new Set(payments.map(payment => payment.createdById))] } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ])
  const userById = new Map(paymentUsers.map(user => [user.id, user]))
  const lineById = new Map(purchase.lines.map(line => [line.id, line]))
  const totalPyg = purchase.lines.reduce((sum, line) => sum + line.finalTotalCostPyg, 0)
  const nombreLinea = (lineId: unknown) => {
    const line = lineById.get(String(lineId || ''))
    return line ? (line.product?.name || line.product?.sku || line.productId) : 'Línea'
  }
  const recibida = audits.find(audit => audit.action === 'PURCHASE_RECEIVED')
  const detalleRecepcion = `${purchase.supplierName} · ${purchase.lines.length} línea${purchase.lines.length === 1 ? '' : 's'} · Gs ${gs(totalPyg)}`

  const events: TimelineEvent[] = [
    {
      id: `purchase-${purchase.id}`,
      type: 'purchase',
      action: 'Compra creada',
      createdAt: purchase.createdAt,
      user: purchase.createdBy,
      detail: `${purchase.supplierName} · ${purchase.lines.length} línea${purchase.lines.length === 1 ? '' : 's'} · Gs ${gs(totalPyg)} · ${purchase.status === 'RECEIVED' ? 'Recibida' : 'Borrador'}${purchase.supplierReference ? ` · Ref. ${purchase.supplierReference}` : ''}`,
    },
    ...(recibida ? [{
      id: `purchase-${purchase.id}-received`,
      type: 'purchase',
      action: 'Compra recibida (stock sumado)',
      createdAt: recibida.createdAt,
      user: recibida.user,
      detail: detalleRecepcion,
    }] : purchase.receivedAt ? [{
      id: `purchase-${purchase.id}-received`,
      type: 'purchase',
      action: 'Compra recibida (stock sumado)',
      createdAt: purchase.receivedAt,
      user: purchase.createdBy,
      detail: detalleRecepcion,
    }] : []),
    ...payments.map(payment => ({
      id: `payment-${payment.id}`,
      type: 'payment',
      action: payment.kind === 'ADVANCE' ? 'Anticipo a proveedor' : 'Pago a proveedor',
      createdAt: payment.paidAt || payment.createdAt,
      user: userById.get(payment.createdById) || null,
      detail: `Gs ${gs(payment.amountPyg)}${payment.currency !== 'PYG' ? ` · ${payment.currency} ${payment.originalAmount} · cotización ${payment.exchangeRatePyg}` : ''}${payment.reference ? ` · ${payment.reference}` : ''}${payment.account?.name ? ` · ${payment.account.name}` : ''}`,
    })),
    ...audits.filter(audit => audit.action === 'PURCHASE_COSTS_UPDATED').map(audit => {
      const data = (audit.metadata || {}) as Record<string, unknown>
      const before = (data.before || {}) as Record<string, unknown>
      const after = (data.after || {}) as Record<string, unknown>
      return {
        id: `audit-${audit.id}`,
        type: 'price',
        action: 'Costo de línea actualizado',
        createdAt: audit.createdAt,
        user: audit.user,
        detail: `${nombreLinea(data.lineId)} · costo Gs ${gs(before.unitCostPyg)} → Gs ${gs(after.unitCostPyg)} · final Gs ${gs(after.finalTotalCostPyg)}`,
      }
    }),
    ...attachments.map(attachment => ({
      id: `attachment-${attachment.id}`,
      type: 'attachment',
      action: attachment.entity === 'SUPPLIER_PAYMENT' ? 'Comprobante de pago adjuntado' : 'Adjunto de la compra',
      createdAt: attachment.createdAt,
      user: attachment.createdBy,
      detail: attachment.fileName,
    })),
    ...audits.filter(audit => !CON_EVENTO_PROPIO.has(audit.action)).map(audit => ({
      id: `audit-${audit.id}`,
      type: 'audit',
      action: ACCIONES[audit.action] || audit.action.replace(/_/g, ' ').toLowerCase(),
      createdAt: audit.createdAt,
      user: audit.user,
      detail: detalleMetadata(audit.metadata),
    })),
  ]
  events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return json({ events: events.slice(0, 300) })
}
