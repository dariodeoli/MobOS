import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { effectivePermissions, hasPermission, normalizeAccessSchedule, requireSession, USER_ROLES } from '../../../lib/auth'
import { error, json } from '../../../lib/http'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// El PIN identifica al vendedor en el acceso de operador: no puede repetirse
// dentro de la misma empresa. Se compara contra los hash activos (pocos por
// tenant, por lo que el loop de bcrypt es aceptable).
async function pinDuplicado(tenantId: string, pin: string, exceptUserId?: string) {
  const users = await prisma.user.findMany({ where: { tenantId, status: 'ACTIVE', ...(exceptUserId ? { id: { not: exceptUserId } } : {}) }, select: { pinHash: true } })
  for (const user of users) {
    if (await bcrypt.compare(pin, user.pinHash)) return true
  }
  return false
}

const userStatuses = ['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const
const userSelect = {
  id: true, name: true, email: true, role: true, status: true, branchId: true, permissions: true, accessSchedule: true,
  failedLoginAttempts: true, lockedUntil: true, lastAccessAt: true, dailyGoalPyg: true, createdAt: true, updatedAt: true,
  avatar: { select: { userId: true } },
} as const

function serializeUser(user: any) {
  const { avatar, ...rest } = user
  return { ...rest, hasAvatar: Boolean(avatar), effectivePermissions: effectivePermissions(user.role, user.permissions), isLocked: !!user.lockedUntil && user.lockedUntil > new Date() }
}

async function adminSession(request: Request) {
  const session = await requireSession(request)
  if (!session) return { error: error('Sesión inválida.', 401) }
  if (!hasPermission(session.user, 'team:manage')) return { error: error('No autorizado.', 403) }
  return { session }
}

function validRole(value: unknown): value is (typeof USER_ROLES)[number] { return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value) }
function validStatus(value: unknown): value is (typeof userStatuses)[number] { return typeof value === 'string' && (userStatuses as readonly string[]).includes(value) }
function validPermissions(value: unknown) { return Array.isArray(value) && value.length <= 32 && value.every(permission => typeof permission === 'string' && /^[a-z]+:[a-z*]+$/.test(permission) && permission.length <= 64) }
function snapshot(user: any) { return { name: user.name, email: user.email, role: user.role, status: user.status, branchId: user.branchId, permissions: user.permissions, accessSchedule: user.accessSchedule } }

async function ensureBranch(tenantId: string, branchId: unknown) {
  if (branchId === null || branchId === undefined || branchId === '') return null
  if (typeof branchId !== 'string') throw new Error('Sucursal inválida.')
  const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId, isActive: true }, select: { id: true } })
  if (!branch) throw new Error('Sucursal no encontrada.')
  return branch.id
}

async function wouldRemoveLastAdmin(tenantId: string, current: any, nextRole: string, nextStatus: string) {
  if (current.role !== 'ADMIN' || (nextRole === 'ADMIN' && nextStatus === 'ACTIVE')) return false
  return (await prisma.user.count({ where: { tenantId, role: 'ADMIN', status: 'ACTIVE' } })) <= 1
}

export async function GET(request: Request) {
  const access = await adminSession(request); if ('error' in access) return access.error
  const users = await prisma.user.findMany({ where: { tenantId: access.session.user.tenantId }, select: userSelect, orderBy: { name: 'asc' } })
  return json(users.map(serializeUser))
}

export async function POST(request: Request) {
  const access = await adminSession(request); if ('error' in access) return access.error
  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const email = typeof body?.email === 'string' && body.email.trim() ? body.email.trim().toLowerCase() : null
  const pin = typeof body?.pin === 'string' ? body.pin : ''
  if (!name || name.length > 100 || (email && !emailPattern.test(email)) || !/^\d{4}$/.test(pin) || Object.prototype.hasOwnProperty.call(body || {}, 'pinHash') || !validRole(body?.role ?? 'VENDEDOR')) return error('Nombre, rol válido y PIN de 4 dígitos son obligatorios; pinHash no es aceptado.')
  try {
    const tenantId = access.session.user.tenantId
    const [branchId, accessSchedule, pinEnUso] = await Promise.all([ensureBranch(tenantId, body?.branchId), Promise.resolve(normalizeAccessSchedule(body?.accessSchedule)), pinDuplicado(tenantId, pin)])
    if (pinEnUso) return error('Ese PIN ya lo usa otro usuario de la empresa. Elegí otro.', 409)
    if (body?.permissions !== undefined && !validPermissions(body.permissions)) return error('Permisos inválidos.')
    const pinHash = await bcrypt.hash(pin, 12)
    const created = await prisma.$transaction(async tx => {
      const user = await tx.user.create({ data: { tenantId, name, email, pinHash, role: body?.role ?? 'VENDEDOR', branchId, ...(body?.permissions === undefined ? {} : { permissions: body.permissions ?? Prisma.JsonNull }), ...(accessSchedule === null ? {} : { accessSchedule }) }, select: userSelect })
      await tx.auditLog.create({ data: { tenantId, userId: access.session.user.id, action: 'USER_CREATED', entity: 'User', entityId: user.id, metadata: { after: snapshot(user) } } })
      return user
    })
    return json(serializeUser(created), { status: 201 })
  } catch (cause) {
    if (cause instanceof Error && /Sucursal|Horario|Zona|Rango|Día/.test(cause.message)) return error(cause.message, 400)
    if ((cause as any)?.code === 'P2002') return error('No se pudo guardar el usuario. Revisá los datos e intentá nuevamente.', 409)
    return error('No se pudo crear el usuario.', 500)
  }
}

export async function PATCH(request: Request) {
  const access = await adminSession(request); if ('error' in access) return access.error
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id || Object.prototype.hasOwnProperty.call(body || {}, 'pinHash')) return error('Usuario inválido; pinHash no es aceptado.')
  const tenantId = access.session.user.tenantId
  const current = await prisma.user.findFirst({ where: { id, tenantId }, select: userSelect })
  if (!current) return error('Usuario no encontrado.', 404)
  try {
    const nextRole = body.role === undefined ? current.role : validRole(body.role) ? body.role : null
    const nextStatus = body.status === undefined ? current.status : validStatus(body.status) ? body.status : null
    if (!nextRole || !nextStatus) return error('Rol o estado inválido.')
    if (id === access.session.user.id && (nextRole !== current.role || nextStatus !== 'ACTIVE')) return error('No podés cambiar tu propio rol ni desactivar tu cuenta desde esta sesión.', 409)
    if (await wouldRemoveLastAdmin(tenantId, current, nextRole, nextStatus)) return error('La empresa debe conservar al menos un administrador activo.', 409)
    const name = body.name === undefined ? current.name : typeof body.name === 'string' && body.name.trim() && body.name.trim().length <= 100 ? body.name.trim() : null
    const email = body.email === undefined ? current.email : body.email === null || body.email === '' ? null : typeof body.email === 'string' && emailPattern.test(body.email.trim()) ? body.email.trim().toLowerCase() : null
    if (!name || (body.email !== undefined && body.email !== null && body.email !== '' && !email)) return error('Nombre o correo inválido.')
    const branchId = body.branchId === undefined ? current.branchId : await ensureBranch(tenantId, body.branchId)
    const accessSchedule = body.accessSchedule === undefined ? current.accessSchedule : normalizeAccessSchedule(body.accessSchedule)
    const permissions = body.permissions === undefined ? current.permissions : body.permissions === null ? null : validPermissions(body.permissions) ? body.permissions : null
    if (body.permissions !== undefined && body.permissions !== null && !validPermissions(body.permissions)) return error('Permisos inválidos.')
    const dailyGoalPyg = body.dailyGoalPyg === undefined ? current.dailyGoalPyg : body.dailyGoalPyg === null ? null : Number.isSafeInteger(Number(body.dailyGoalPyg)) && Number(body.dailyGoalPyg) >= 0 && Number(body.dailyGoalPyg) <= 1000000000000 ? Number(body.dailyGoalPyg) : null
    if (body.dailyGoalPyg !== undefined && body.dailyGoalPyg !== null && dailyGoalPyg === null) return error('Meta diaria inválida: usá un número entero no negativo.')
    const resetPin = body.resetPin === true
    if (resetPin && (typeof body.pin !== 'string' || !/^\d{4}$/.test(body.pin))) return error('Para restablecer el PIN ingresá exactamente 4 dígitos.')
    if (!resetPin && body.pin !== undefined) return error('Confirmá resetPin para cambiar el PIN.', 400)
    if (resetPin && await pinDuplicado(tenantId, body.pin, id)) return error('Ese PIN ya lo usa otro usuario de la empresa. Elegí otro.', 409)
    const changedSensitive = resetPin || current.role !== nextRole || current.status !== nextStatus || current.branchId !== branchId || JSON.stringify(current.permissions) !== JSON.stringify(permissions) || JSON.stringify(current.accessSchedule) !== JSON.stringify(accessSchedule)
    const updated = await prisma.$transaction(async tx => {
      const user = await tx.user.update({ where: { id }, data: { name, email, role: nextRole, status: nextStatus, branchId, permissions: permissions ?? Prisma.JsonNull, accessSchedule: accessSchedule ?? Prisma.JsonNull, dailyGoalPyg, ...(resetPin ? { pinHash: await bcrypt.hash(body.pin, 12), failedLoginAttempts: 0, lockedUntil: null } : {}) }, select: userSelect })
      if (changedSensitive) await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })
      await tx.auditLog.create({ data: { tenantId, userId: access.session.user.id, action: resetPin ? 'USER_PIN_RESET' : nextStatus !== 'ACTIVE' && current.status === 'ACTIVE' ? 'USER_DEACTIVATED' : 'USER_UPDATED', entity: 'User', entityId: id, metadata: { before: snapshot(current), after: snapshot(user), sessionsRevoked: changedSensitive } } })
      return user
    })
    return json(serializeUser(updated))
  } catch (cause) {
    if (cause instanceof Error && /Sucursal|Horario|Zona|Rango|Día/.test(cause.message)) return error(cause.message, 400)
    if ((cause as any)?.code === 'P2002') return error('No se pudo guardar el usuario. Revisá los datos e intentá nuevamente.', 409)
    return error('No se pudo actualizar el usuario.', 500)
  }
}
