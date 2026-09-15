import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { UserRole } from '@prisma/client'

// Reglas de comisión sobre el margen de las ventas. Solo ADMIN las gestiona.
// Cada regla aplica a un usuario específico o a un rol, nunca a ambos a la vez,
// y el porcentaje va de 0 a 100. La regla por usuario prevalece sobre la de rol
// al calcular el reporte de comisiones.
const text = (value: unknown, max = 128) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const validRole = (value: unknown) => value === undefined || value === null || value === '' ? null : Object.values(UserRole).includes(value as UserRole) ? value as UserRole : undefined

type RuleInput = { userId: string | null; role: string | null; percentPyg: number | null }

function parseRule(body: Record<string, unknown> | null, requirePercent: boolean): { ok: true; value: RuleInput } | { ok: false; message: string } {
  const userId = body?.userId === undefined || body.userId === null || body.userId === '' ? null : text(body.userId)
  const role = validRole(body?.role)
  if (role === undefined) return { ok: false, message: 'Rol inválido.' }
  if (userId && role) return { ok: false, message: 'La regla aplica a un usuario o a un rol, no a ambos.' }
  if (!userId && !role) return { ok: false, message: 'Indicá un usuario o un rol para la regla.' }
  const percent = body?.percentPyg === undefined || body.percentPyg === null || body.percentPyg === '' ? null : Number(body.percentPyg)
  if (requirePercent && percent === null) return { ok: false, message: 'El porcentaje es obligatorio.' }
  if (percent !== null && (!Number.isSafeInteger(percent) || percent < 0 || percent > 100)) return { ok: false, message: 'El porcentaje debe ser un entero entre 0 y 100.' }
  return { ok: true, value: { userId, role, percentPyg: percent } }
}

function shape(rule: { id: string; userId: string | null; role: string | null; percentPyg: number | null; createdAt: Date; updatedAt: Date; user: { id: string; name: string } | null }) {
  return {
    id: rule.id,
    userId: rule.userId,
    role: rule.role,
    percentPyg: rule.percentPyg,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
    user: rule.user ? { id: rule.user.id, name: rule.user.name } : null,
  }
}

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('No autorizado.', 403)
  const rules = await prisma.commissionRule.findMany({
    where: { tenantId: session.user.tenantId },
    select: { id: true, userId: true, role: true, percentPyg: true, createdAt: true, updatedAt: true, user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return json(rules.map(shape))
}

export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('No autorizado.', 403)
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const parsed = parseRule(body, true)
  if (!parsed.ok) return error(parsed.message)
  try {
    const created = await prisma.$transaction(async tx => {
      if (parsed.value.userId && !(await tx.user.findFirst({ where: { id: parsed.value.userId, tenantId: session.user.tenantId }, select: { id: true } }))) throw new Error('Usuario no encontrado.')
      const rule = await tx.commissionRule.create({
        data: { tenantId: session.user.tenantId, userId: parsed.value.userId, role: parsed.value.role as UserRole | null, percentPyg: parsed.value.percentPyg },
        select: { id: true, userId: true, role: true, percentPyg: true, createdAt: true, updatedAt: true, user: { select: { id: true, name: true } } },
      })
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'COMMISSION_RULE_CREATED', entity: 'CommissionRule', entityId: rule.id, metadata: { userId: rule.userId, role: rule.role, percentPyg: rule.percentPyg } } })
      return rule
    })
    return json(shape(created), { status: 201 })
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo crear la regla.', 409) }
}

export async function PATCH(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('No autorizado.', 403)
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const id = text(body?.id)
  if (!id) return error('Regla obligatoria.')
  try {
    const existing = await prisma.commissionRule.findFirst({ where: { id, tenantId: session.user.tenantId }, select: { id: true, userId: true, role: true } })
    if (!existing) return error('Regla no encontrada.', 404)
    const userId = body?.userId === undefined ? existing.userId : body.userId === null || body.userId === '' ? null : text(body.userId)
    const roleRaw = body?.role === undefined ? existing.role : body.role === null || body.role === '' ? null : validRole(body.role)
    if (roleRaw === undefined) return error('Rol inválido.')
    const role = roleRaw as string | null
    if (userId && role) return error('La regla aplica a un usuario o a un rol, no a ambos.')
    if (!userId && !role) return error('Indicá un usuario o un rol para la regla.')
    const targetChanged = userId !== existing.userId || role !== existing.role
    let percentPyg: number | null | undefined
    if (body?.percentPyg !== undefined) {
      const percent = body.percentPyg === null || body.percentPyg === '' ? null : Number(body.percentPyg)
      if (percent !== null && (!Number.isSafeInteger(percent) || percent < 0 || percent > 100)) return error('El porcentaje debe ser un entero entre 0 y 100.')
      percentPyg = percent
    }
    const updated = await prisma.$transaction(async tx => {
      if (targetChanged && userId && !(await tx.user.findFirst({ where: { id: userId, tenantId: session.user.tenantId }, select: { id: true } }))) throw new Error('Usuario no encontrado.')
      const rule = await tx.commissionRule.update({
        where: { id },
        data: {
          ...(targetChanged ? { userId, role: role as UserRole | null } : {}),
          ...(percentPyg !== undefined ? { percentPyg } : {}),
        },
        select: { id: true, userId: true, role: true, percentPyg: true, createdAt: true, updatedAt: true, user: { select: { id: true, name: true } } },
      })
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'COMMISSION_RULE_UPDATED', entity: 'CommissionRule', entityId: id, metadata: { userId: rule.userId, role: rule.role, percentPyg: rule.percentPyg } } })
      return rule
    })
    return json(shape(updated))
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo actualizar la regla.', 409) }
}

export async function DELETE(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('No autorizado.', 403)
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const id = text(body?.id)
  if (!id) return error('Regla obligatoria.')
  try {
    const existing = await prisma.commissionRule.findFirst({ where: { id, tenantId: session.user.tenantId }, select: { id: true, userId: true, role: true } })
    if (!existing) return error('Regla no encontrada.', 404)
    await prisma.$transaction(async tx => {
      await tx.commissionRule.delete({ where: { id } })
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'COMMISSION_RULE_DELETED', entity: 'CommissionRule', entityId: id, metadata: { userId: existing.userId, role: existing.role } } })
    })
    return json({ ok: true })
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo eliminar la regla.', 409) }
}
