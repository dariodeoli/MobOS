import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../../lib/auth'
import { ensureStoreBranch } from '../../../../../lib/store-branch'

type RouteContext = { params: { id: string } }

const gs = (value: unknown) => Number(value || 0).toLocaleString('es-PY')

const KINDS: Record<string, string> = {
  EXPENSE: 'Gasto',
  TRANSFER: 'Transferencia',
  SUPPLIER_ADVANCE: 'Adelanto a proveedor',
  CHEQUE: 'Cheque',
  OWNER_WITHDRAWAL: 'Retiro del dueño',
  ADJUSTMENT: 'Ajuste',
}

const ESTADOS: Record<string, string> = { PENDING: 'Pendiente', CLEARED: 'Cobrado', VOID: 'Anulado' }

const ACCIONES: Record<string, string> = {
  CASH_MOVEMENT_CLEARED: 'Movimiento cobrado',
  FINANCE_MOVEMENT_VOIDED: 'Movimiento anulado',
  CASH_MOVEMENT_RECORDED: 'Movimiento registrado',
  FINANCE_MOVEMENT_CREATED: 'Movimiento registrado',
}

// Acciones con evento propio (la fila del gasto): no se repiten desde la
// auditoría para no duplicar el alta en la cronología.
const CON_EVENTO_PROPIO = new Set(['CASH_MOVEMENT_RECORDED', 'FINANCE_MOVEMENT_CREATED'])

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

// Cronología del gasto: es un CashMovement (kind EXPENSE) del libro financiero,
// así que reúne alta, cobro o anulación, adjuntos del comprobante y auditoría.
// Mismo alcance que /api/finance y /api/cash: ADMIN todo; GERENTE su sucursal.
export async function GET(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['cash:manage'])) return error('No autorizado.', 403)
  const tenant = session.user.tenantId
  const id = (params.id || '').trim().slice(0, 128)
  if (!id) return error('Gasto obligatorio.')

  const movement = await prisma.cashMovement.findFirst({
    where: { id, tenantId: tenant, kind: 'EXPENSE' },
    select: {
      id: true, branchId: true, kind: true, direction: true, currency: true, originalAmount: true, exchangeRatePyg: true, amountPyg: true,
      counterparty: true, reference: true, description: true, status: true, dueAt: true, clearedAt: true, createdAt: true, createdById: true,
      account: { select: { name: true } },
    },
  })
  if (!movement) return error('Gasto no encontrado.', 404)
  if (session.user.role === 'GERENTE') {
    const branchId = session.user.branchId || await ensureStoreBranch(session)
    if (!branchId || movement.branchId !== branchId) return error('No autorizado para esa sucursal.', 403)
  }

  const [attachments, audits, creador] = await Promise.all([
    prisma.attachment.findMany({
      where: { tenantId: tenant, entity: 'EXPENSE', entityId: movement.id },
      select: { id: true, fileName: true, createdAt: true, createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
    prisma.auditLog.findMany({
      where: { tenantId: tenant, entity: { in: ['CashMovement', 'Expense'] }, entityId: movement.id },
      select: { id: true, action: true, metadata: true, createdAt: true, user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
    prisma.user.findFirst({ where: { tenantId: tenant, id: movement.createdById }, select: { id: true, name: true } }),
  ])

  const events: TimelineEvent[] = [
    {
      id: `expense-${movement.id}`,
      type: 'expense',
      action: `${KINDS[movement.kind] || 'Gasto'} registrado`,
      createdAt: movement.createdAt,
      user: creador,
      detail: `Gs ${gs(movement.amountPyg)}${movement.currency !== 'PYG' ? ` · ${movement.currency} ${movement.originalAmount} · cotización ${movement.exchangeRatePyg}` : ''} · ${movement.description}${movement.counterparty ? ` · ${movement.counterparty}` : ''}${movement.reference ? ` · ${movement.reference}` : ''}${movement.account?.name ? ` · ${movement.account.name}` : ''} · ${ESTADOS[movement.status] || movement.status}`,
    },
    ...attachments.map(attachment => ({
      id: `attachment-${attachment.id}`,
      type: 'attachment',
      action: 'Comprobante adjuntado',
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
