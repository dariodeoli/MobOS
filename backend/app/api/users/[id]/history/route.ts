import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../../lib/auth'

type RouteContext = { params: { id: string } }

const gs = (value: unknown) => Number(value || 0).toLocaleString('es-PY')
const ROLES: Record<string, string> = { ADMIN: 'Administrador', GERENTE: 'Gerente', VENDEDOR: 'Vendedor', CAJERA: 'Cajera', TECNICO: 'Técnico' }
const ESTADOS: Record<string, string> = { ACTIVE: 'Activo', INACTIVE: 'Inactivo', SUSPENDED: 'Suspendido' }

const ACCIONES: Record<string, string> = {
  USER_CREATED: 'Usuario creado',
  USER_UPDATED: 'Usuario actualizado',
  USER_DEACTIVATED: 'Usuario desactivado',
  USER_PIN_RESET: 'PIN restablecido',
}

// Resumen legible de la metadata de auditoría (nunca se devuelve el JSON crudo
// ni valores de PIN o credenciales).
function detalleUsuario(metadata: unknown, nombreSucursal: (id: unknown) => string) {
  if (!metadata || typeof metadata !== 'object') return ''
  const data = metadata as Record<string, any>
  const before = (data.before || {}) as Record<string, any>
  const after = (data.after || {}) as Record<string, any>
  const cambios: string[] = []
  if ((before.name || '') !== (after.name || '') && (after.name || before.name)) cambios.push(`Nombre: ${before.name || '—'} → ${after.name || '—'}`)
  if ((before.role || '') !== (after.role || '') && (after.role || before.role)) cambios.push(`Rol: ${ROLES[before.role] || before.role || '—'} → ${ROLES[after.role] || after.role || '—'}`)
  if ((before.status || '') !== (after.status || '') && (after.status || before.status)) cambios.push(`Estado: ${ESTADOS[before.status] || before.status || '—'} → ${ESTADOS[after.status] || after.status || '—'}`)
  if ((before.branchId || null) !== (after.branchId || null)) cambios.push(`Sucursal: ${nombreSucursal(before.branchId)} → ${nombreSucursal(after.branchId)}`)
  if (JSON.stringify(before.permissions ?? null) !== JSON.stringify(after.permissions ?? null)) cambios.push('Permisos actualizados')
  if (JSON.stringify(before.accessSchedule ?? null) !== JSON.stringify(after.accessSchedule ?? null)) cambios.push('Horario de acceso actualizado')
  if (data.sessionsRevoked) cambios.push('Sesiones revocadas')
  return cambios.join(' · ')
}

type TimelineEvent = {
  id: string
  type: string
  action: string
  createdAt: Date
  user: { id: string; name: string } | null
  detail: string
}

// Cronología del funcionario: alta, cambios auditados de rol, sucursal, estado y
// PIN (sin valores sensibles), reglas de comisión, sus últimas 50 ventas y la
// auditoría de la cuenta. ADMIN todo el tenant; GERENTE con sucursal, la suya.
export async function GET(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  // El dueño administra el equipo; gerencia lee el historial con su alcance de reportes.
  if (!canAccessAny(session.user, ['team:manage', 'reports:read'])) return error('No autorizado.', 403)
  const tenant = session.user.tenantId
  const id = (params.id || '').trim().slice(0, 128)
  if (!id) return error('Usuario obligatorio.')

  const user = await prisma.user.findFirst({
    where: { id, tenantId: tenant },
    select: { id: true, name: true, role: true, status: true, branchId: true, createdAt: true },
  })
  if (!user) return error('Usuario no encontrado.', 404)
  if (session.user.role === 'GERENTE' && session.user.branchId && user.branchId !== session.user.branchId) return error('No autorizado para esa sucursal.', 403)

  const [audits, rules, sales, branches] = await Promise.all([
    prisma.auditLog.findMany({
      where: { tenantId: tenant, entity: 'User', entityId: user.id },
      select: { id: true, action: true, metadata: true, createdAt: true, user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
    prisma.commissionRule.findMany({
      where: { tenantId: tenant, OR: [{ userId: user.id }, { userId: null, role: user.role }] },
      select: { id: true, userId: true, role: true, percentPyg: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.order.findMany({
      where: { tenantId: tenant, sellerId: user.id, status: { not: 'CANCELLED' } },
      select: { id: true, orderNumber: true, totalPyg: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.branch.findMany({ where: { tenantId: tenant }, select: { id: true, name: true } }),
  ])
  const nombreSucursal = (branchId: unknown) => {
    const branch = branches.find(item => item.id === String(branchId || ''))
    return branch ? branch.name : 'Sin sucursal'
  }

  const creado = audits.some(audit => audit.action === 'USER_CREATED')
  const events: TimelineEvent[] = [
    ...(creado ? [] : [{
      id: `user-${user.id}`,
      type: 'user',
      action: 'Usuario creado',
      createdAt: user.createdAt,
      user: null,
      detail: `${user.name} · ${ROLES[user.role] || user.role} · ${nombreSucursal(user.branchId)}`,
    }]),
    ...audits.map(audit => ({
      id: `audit-${audit.id}`,
      type: 'user',
      action: ACCIONES[audit.action] || audit.action.replace(/_/g, ' ').toLowerCase(),
      createdAt: audit.createdAt,
      user: audit.user,
      detail: detalleUsuario(audit.metadata, nombreSucursal),
    })),
    ...rules.flatMap(rule => {
      const detalle = `${rule.percentPyg ?? 0}% sobre el margen · ${rule.userId ? 'regla por usuario' : `regla por rol ${ROLES[rule.role || ''] || rule.role || '—'}`}`
      const asignada: TimelineEvent = {
        id: `rule-${rule.id}`,
        type: 'payment',
        action: 'Regla de comisión asignada',
        createdAt: rule.createdAt,
        user: null,
        detail: detalle,
      }
      const actualizada: TimelineEvent[] = rule.updatedAt.getTime() - rule.createdAt.getTime() > 1000 ? [{
        id: `rule-${rule.id}-updated`,
        type: 'payment',
        action: 'Regla de comisión actualizada',
        createdAt: rule.updatedAt,
        user: null,
        detail: detalle,
      }] : []
      return [asignada, ...actualizada]
    }),
    ...sales.map(order => ({
      id: `sale-${order.id}`,
      type: 'sale',
      action: 'Venta',
      createdAt: order.createdAt,
      user: null,
      detail: `${order.orderNumber} · Gs ${gs(order.totalPyg)}`,
    })),
  ]
  events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return json({ events: events.slice(0, 300) })
}
