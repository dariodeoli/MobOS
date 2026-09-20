import { prisma } from '../../../../../../lib/prisma'
import { error, json } from '../../../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../../../lib/auth'
import { ensureStoreBranch } from '../../../../../../lib/store-branch'

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

const ACCIONES: Record<string, string> = {
  CASH_OPENED: 'Caja abierta',
  CASH_CLOSED: 'Caja cerrada',
  CASH_MOVEMENT_CLEARED: 'Cheque cobrado',
  CASH_MOVEMENT_RECORDED: 'Movimiento registrado',
  FINANCE_MOVEMENT_CREATED: 'Movimiento registrado',
  FINANCE_MOVEMENT_VOIDED: 'Movimiento anulado',
}

// Acciones con evento propio (apertura, cierre o fila del movimiento): no se
// repiten desde la auditoría para no duplicar el mismo movimiento.
const CON_EVENTO_PROPIO = new Set(['CASH_OPENED', 'CASH_CLOSED', 'CASH_MOVEMENT_RECORDED', 'FINANCE_MOVEMENT_CREATED'])

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

// Cronología de la sesión de caja: apertura, movimientos del período de la
// sesión, cierre con la diferencia del arqueo, foto del arqueo y auditoría.
// Mismo alcance que /api/cash: ADMIN todo; GERENTE su sucursal.
export async function GET(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['cash:manage'])) return error('No autorizado.', 403)
  const tenant = session.user.tenantId
  const id = (params.id || '').trim().slice(0, 128)
  if (!id) return error('Sesión de caja obligatoria.')

  const cashSession = await prisma.cashSession.findFirst({
    where: { id, tenantId: tenant },
    select: {
      id: true, branchId: true, openedAt: true, closedAt: true, openingPyg: true, countedPyg: true, expectedPyg: true, status: true, notes: true,
      openedBy: { select: { id: true, name: true } },
      closedBy: { select: { id: true, name: true } },
      branch: { select: { name: true } },
    },
  })
  if (!cashSession) return error('Sesión de caja no encontrada.', 404)
  if (session.user.role === 'GERENTE') {
    const branchId = session.user.branchId || await ensureStoreBranch(session)
    if (!branchId || cashSession.branchId !== branchId) return error('No autorizado para esa sucursal.', 403)
  }

  const until = cashSession.closedAt || new Date()
  const movements = await prisma.cashMovement.findMany({
    where: { tenantId: tenant, branchId: cashSession.branchId, createdAt: { gte: cashSession.openedAt, lte: until } },
    select: { id: true, kind: true, direction: true, currency: true, originalAmount: true, amountPyg: true, counterparty: true, reference: true, description: true, status: true, dueAt: true, clearedAt: true, createdAt: true, createdById: true, account: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })
  const movementIds = movements.map(movement => movement.id)
  const [attachments, audits, movementUsers] = await Promise.all([
    prisma.attachment.findMany({
      where: { tenantId: tenant, entity: 'CASH_SESSION', entityId: cashSession.id },
      select: { id: true, fileName: true, createdAt: true, createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
    prisma.auditLog.findMany({
      where: { tenantId: tenant, OR: [
        { entity: 'CashSession', entityId: cashSession.id },
        ...(movementIds.length ? [{ entity: 'CashMovement', entityId: { in: movementIds } }] : []),
      ] },
      select: { id: true, action: true, metadata: true, createdAt: true, user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
    movements.length
      ? prisma.user.findMany({ where: { tenantId: tenant, id: { in: [...new Set(movements.map(movement => movement.createdById))] } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ])
  const userById = new Map(movementUsers.map(user => [user.id, user]))

  const events: TimelineEvent[] = [
    {
      id: `cash-${cashSession.id}-open`,
      type: 'cash',
      action: 'Caja abierta',
      createdAt: cashSession.openedAt,
      user: cashSession.openedBy,
      detail: `Fondo inicial Gs ${gs(cashSession.openingPyg)}${cashSession.branch?.name ? ` · ${cashSession.branch.name}` : ''}${cashSession.notes ? ` · ${cashSession.notes}` : ''}`,
    },
    ...(cashSession.closedAt ? [{
      id: `cash-${cashSession.id}-close`,
      type: 'cash',
      action: 'Caja cerrada',
      createdAt: cashSession.closedAt,
      user: cashSession.closedBy,
      detail: `Esperado Gs ${gs(cashSession.expectedPyg)} · contado Gs ${gs(cashSession.countedPyg)} · diferencia Gs ${gs((cashSession.countedPyg ?? 0) - (cashSession.expectedPyg ?? 0))}${cashSession.notes ? ` · ${cashSession.notes}` : ''}`,
    }] : []),
    ...movements.map(movement => ({
      id: `movement-${movement.id}`,
      type: movement.kind === 'EXPENSE' ? 'expense' : 'payment',
      action: `${movement.direction === 'IN' ? 'Ingreso' : 'Salida'} de caja · ${KINDS[movement.kind] || movement.kind}`,
      createdAt: movement.createdAt,
      user: userById.get(movement.createdById) || null,
      detail: `Gs ${gs(movement.amountPyg)}${movement.currency !== 'PYG' ? ` · ${movement.currency} ${movement.originalAmount}` : ''} · ${movement.description}${movement.counterparty ? ` · ${movement.counterparty}` : ''}${movement.reference ? ` · ${movement.reference}` : ''}${movement.account?.name ? ` · ${movement.account.name}` : ''} · ${movement.status === 'CLEARED' ? 'Cobrado' : movement.status === 'VOID' ? 'Anulado' : 'Pendiente'}${movement.clearedAt ? ` ${movement.clearedAt.toLocaleDateString('es-PY')}` : ''}`,
    })),
    ...attachments.map(attachment => ({
      id: `attachment-${attachment.id}`,
      type: 'attachment',
      action: 'Foto de arqueo adjuntada',
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
