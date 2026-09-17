import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'

type RouteContext = { params: { id: string } }

const ESTADO_PEDIDO: Record<string, string> = { PENDING: 'Pendiente', REGISTERED: 'Registrado', COMPLETED: 'Completado', CANCELLED: 'Cancelado' }
const ESTADO_GARANTIA: Record<string, string> = { RECEIVED: 'Recibida', DIAGNOSIS: 'En diagnóstico', READY: 'Lista', DELIVERED: 'Entregada' }
const TIPO_SEGUIMIENTO: Record<string, string> = { CALL: 'Llamada', WHATSAPP: 'WhatsApp', VISIT: 'Visita', OTHER: 'Seguimiento' }

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

// Cronología del cliente: alta, pedidos, pagos confirmados, notas internas,
// seguimientos (agendado/hecho), garantías y auditoría, más reciente primero.
// Mismo alcance de sucursal que el perfil: VENDEDOR solo si tiene pedidos en
// su sucursal; ADMIN/GERENTE ven todo el tenant.
export async function GET(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const tenant = session.user.tenantId
  const id = (params.id || '').trim().slice(0, 128)
  if (!id) return error('Cliente obligatorio.')

  const customer = await prisma.customer.findFirst({
    where: { id, tenantId: tenant },
    select: { id: true, name: true, createdAt: true, createdBy: { select: { id: true, name: true } } },
  })
  if (!customer) return error('Cliente no encontrado.', 404)

  const sellerBranchId = session.user.role === 'VENDEDOR' ? session.user.branchId : null
  const branchId = session.user.role === 'GERENTE' ? null : sellerBranchId

  const [orders, notes, followUps, audits] = await Promise.all([
    prisma.order.findMany({
      where: { tenantId: tenant, customerId: customer.id, ...(branchId ? { branchId } : {}) },
      select: {
        id: true, orderNumber: true, totalPyg: true, status: true, createdAt: true,
        seller: { select: { id: true, name: true } },
        items: { select: { serials: true } },
        payments: { where: { status: 'CONFIRMED' }, select: { id: true, amountPyg: true, method: true, paidAt: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
    prisma.customerNote.findMany({
      where: { tenantId: tenant, customerId: customer.id },
      select: { id: true, content: true, createdAt: true, user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
    prisma.customerFollowUp.findMany({
      where: { tenantId: tenant, customerId: customer.id },
      select: { id: true, kind: true, note: true, dueAt: true, doneAt: true, createdAt: true, user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
    prisma.auditLog.findMany({
      where: { tenantId: tenant, entity: 'Customer', entityId: customer.id },
      select: { id: true, action: true, metadata: true, createdAt: true, user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
  ])
  if (branchId && !orders.length) return error('No autorizado para esa sucursal.', 403)

  const serials = [...new Set(orders.flatMap(order => order.items.flatMap(item => Array.isArray(item.serials) ? item.serials as string[] : [])))]
  const warranties = await prisma.warrantyCase.findMany({
    where: {
      tenantId: tenant,
      ...(branchId ? { branchId } : {}),
      OR: [
        { customerName: customer.name },
        ...(serials.length ? [{ serial: { in: serials } }] : []),
      ],
    },
    select: { id: true, serial: true, description: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const events: TimelineEvent[] = [
    {
      id: `customer-${customer.id}`,
      type: 'customer',
      action: 'Cliente creado',
      createdAt: customer.createdAt,
      user: customer.createdBy,
      detail: `Creado por ${customer.createdBy?.name || 'Sistema'}`,
    },
    ...orders.flatMap(order => {
      const pedido: TimelineEvent = {
        id: `order-${order.id}`,
        type: 'order',
        action: 'Pedido creado',
        createdAt: order.createdAt,
        user: order.seller,
        detail: `Pedido ${order.orderNumber} · Gs ${order.totalPyg.toLocaleString('es-PY')} · ${ESTADO_PEDIDO[order.status] || order.status}`,
      }
      const pagos: TimelineEvent[] = order.payments.map(payment => ({
        id: `payment-${payment.id}`,
        type: 'payment',
        action: 'Pago confirmado',
        createdAt: payment.paidAt || payment.createdAt,
        user: null,
        detail: `Pedido ${order.orderNumber} · Gs ${payment.amountPyg.toLocaleString('es-PY')} · ${payment.method}`,
      }))
      return [pedido, ...pagos]
    }),
    ...notes.map(note => ({
      id: `note-${note.id}`,
      type: 'note',
      action: 'Nota interna',
      createdAt: note.createdAt,
      user: note.user,
      detail: note.content,
    })),
    ...followUps.flatMap(item => {
      const creado: TimelineEvent = {
        id: `followUp-${item.id}`,
        type: 'followUp',
        action: 'Seguimiento agendado',
        createdAt: item.createdAt,
        user: item.user,
        detail: `${TIPO_SEGUIMIENTO[item.kind] || 'Seguimiento'}${item.dueAt ? ` · para ${item.dueAt.toLocaleDateString('es-PY')}` : ''} · ${item.note}`,
      }
      const hecho: TimelineEvent[] = item.doneAt ? [{
        id: `followUp-${item.id}-done`,
        type: 'followUp',
        action: 'Seguimiento hecho',
        createdAt: item.doneAt,
        user: item.user,
        detail: item.note,
      }] : []
      return [creado, ...hecho]
    }),
    ...warranties.map(warranty => ({
      id: `warranty-${warranty.id}`,
      type: 'warranty',
      action: 'Garantía registrada',
      createdAt: warranty.createdAt,
      user: null,
      detail: `${warranty.description || 'Garantía'} · serial ${warranty.serial} · ${ESTADO_GARANTIA[warranty.status] || warranty.status}`,
    })),
    ...audits.map(audit => ({
      id: `audit-${audit.id}`,
      type: 'audit',
      action: audit.action,
      createdAt: audit.createdAt,
      user: audit.user,
      detail: detalleMetadata(audit.metadata),
    })),
  ]
  events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return json({ events: events.slice(0, 300) })
}
