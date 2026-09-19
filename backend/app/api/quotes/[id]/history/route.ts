import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'

type RouteContext = { params: { id: string } }

const ESTADOS: Record<string, string> = { DRAFT: 'Borrador', SENT: 'Enviada', ACCEPTED: 'Aceptada', REJECTED: 'Rechazada', CONVERTED: 'Convertida', EXPIRED: 'Vencida', CANCELLED: 'Cancelada' }

const ACCIONES: Record<string, string> = {
  QUOTE_UPDATED: 'Estado actualizado',
  QUOTE_CONVERTED: 'Conversión a pedido',
  QUOTE_CREATED: 'Cotización creada',
  QUOTE_ACCEPTED: 'Aceptada por el cliente',
  QUOTE_REJECTED: 'Rechazada por el cliente',
  QUOTE_PUBLIC_TOKEN_CREATED: 'Enlace del cliente creado',
  QUOTE_PUBLIC_TOKEN_REGENERATED: 'Enlace del cliente regenerado',
}

const gs = (value: unknown) => Number(value || 0).toLocaleString('es-PY')
const estado = (value: unknown) => ESTADOS[String(value)] || String(value || '—')

// Resumen legible de la metadata de auditoría (nunca se devuelve el JSON crudo).
function detalleMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') return ''
  return Object.entries(metadata as Record<string, unknown>)
    .map(([clave, valor]) => `${clave}: ${valor !== null && typeof valor === 'object' ? JSON.stringify(valor) : String(valor)}`)
    .join(' · ')
    .slice(0, 300)
}

function detalleAuditoria(action: string, metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') return ''
  const data = metadata as Record<string, unknown>
  if (action === 'QUOTE_UPDATED') return `Estado: ${estado(data.from)} → ${estado(data.to)}`
  if (action === 'QUOTE_CONVERTED') return `Pedido ${data.orderNumber || data.orderId || '—'}`
  if (action === 'QUOTE_CREATED') return `N.º ${data.number || '—'} · Gs ${gs(data.totalPyg)}`
  if (action === 'QUOTE_ACCEPTED' || action === 'QUOTE_REJECTED') return `${data.origin === 'public' ? 'Desde el enlace del cliente' : 'Interno'}${data.note ? ` · Motivo: ${data.note}` : ''}`
  return detalleMetadata(metadata)
}

type TimelineEvent = {
  id: string
  type: string
  action: string
  createdAt: Date
  user: { id: string; name: string } | null
  detail: string
}

// Cronología de la cotización: alta, cambios de estado, conversión en pedido y
// auditoría de la cotización (incluidas las notas guardadas en la ficha).
// Mismo alcance que GET /api/quotes: VENDEDOR solo la suya; CAJERA su sucursal;
// GERENTE su sucursal cuando la tiene; ADMIN todo el tenant.
export async function GET(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE', 'VENDEDOR', 'CAJERA'].includes(session.user.role)) return error('No autorizado.', 403)
  const tenant = session.user.tenantId
  const id = (params.id || '').trim().slice(0, 128)
  if (!id) return error('Cotización obligatoria.')

  const quote = await prisma.quote.findFirst({
    where: { id, tenantId: tenant },
    select: {
      id: true, number: true, customerName: true, notes: true, totalPyg: true, status: true, createdAt: true, updatedAt: true, sellerId: true, branchId: true,
      seller: { select: { id: true, name: true } },
      order: { select: { id: true, orderNumber: true } },
    },
  })
  if (!quote) return error('Cotización no encontrada.', 404)
  if (session.user.role === 'VENDEDOR' && quote.sellerId !== session.user.id) return error('No autorizado.', 403)
  if (session.user.role === 'CAJERA' && (quote.branchId || null) !== (session.user.branchId || null)) return error('No autorizado para esa sucursal.', 403)
  if (session.user.role === 'GERENTE' && session.user.branchId && quote.branchId !== session.user.branchId) return error('No autorizado para esa sucursal.', 403)

  const audits = await prisma.auditLog.findMany({
    where: { tenantId: tenant, entity: 'Quote', entityId: quote.id },
    select: { id: true, action: true, metadata: true, createdAt: true, user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })

  const eventosAuditoria = audits.filter(audit => audit.action !== 'QUOTE_CREATED')
  const tieneConversion = audits.some(audit => audit.action === 'QUOTE_CONVERTED')
  const events: TimelineEvent[] = [
    {
      id: `quote-${quote.id}`,
      type: 'quote',
      action: 'Cotización creada',
      createdAt: quote.createdAt,
      user: quote.seller,
      detail: `${quote.number} · ${quote.customerName} · Gs ${gs(quote.totalPyg)} · ${estado(quote.status)}${quote.notes ? ` · Nota: ${quote.notes.slice(0, 200)}` : ''}`,
    },
    ...(quote.order && !tieneConversion ? [{
      id: `quote-${quote.id}-converted`,
      type: 'quote',
      action: 'Conversión a pedido',
      createdAt: quote.updatedAt,
      user: quote.seller,
      detail: `Pedido ${quote.order.orderNumber}`,
    }] : []),
    ...eventosAuditoria.map(audit => ({
      id: `audit-${audit.id}`,
      type: audit.action === 'QUOTE_CONVERTED' ? 'quote' : 'audit',
      action: ACCIONES[audit.action] || audit.action.replace(/_/g, ' ').toLowerCase(),
      createdAt: audit.createdAt,
      user: audit.user,
      detail: detalleAuditoria(audit.action, audit.metadata),
    })),
  ]
  events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return json({ events: events.slice(0, 300) })
}
