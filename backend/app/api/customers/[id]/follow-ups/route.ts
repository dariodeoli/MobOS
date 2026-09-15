import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { FollowUpKind } from '@prisma/client'

type RouteContext = { params: { id: string } }

const canWrite = (role: string) => ['ADMIN', 'GERENTE', 'VENDEDOR'].includes(role)
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const validDate = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && Number.isFinite(new Date(value).getTime()))
const kind = (value: unknown) => value === undefined ? undefined : Object.values(FollowUpKind).includes(value as FollowUpKind) ? value as FollowUpKind : null

async function findCustomer(tenant: string, customerId: string) {
  return prisma.customer.findFirst({ where: { id: customerId, tenantId: tenant }, select: { id: true } })
}

export async function POST(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canWrite(session.user.role)) return error('No autorizado.', 403)
  const customerId = (params.id || '').trim().slice(0, 128)
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const note = text(body?.note, 2000)
  if (!customerId || !note) return error('El detalle del seguimiento es obligatorio.')
  const selectedKind = kind(body?.kind)
  if (selectedKind === null) return error('Tipo de seguimiento inválido.')
  if (!validDate(body?.dueAt) || !validDate(body?.doneAt)) return error('Fecha de seguimiento inválida.')
  if (!(await findCustomer(session.user.tenantId, customerId))) return error('Cliente no encontrado.', 404)
  try {
    const created = await prisma.$transaction(async tx => {
      const followUp = await tx.customerFollowUp.create({
        data: {
          tenantId: session.user.tenantId,
          customerId,
          userId: session.user.id,
          note,
          ...(selectedKind !== undefined ? { kind: selectedKind } : {}),
          dueAt: body?.dueAt ? new Date(String(body.dueAt)) : null,
          doneAt: body?.doneAt ? new Date(String(body.doneAt)) : null,
        },
        select: { id: true, kind: true, note: true, dueAt: true, doneAt: true, createdAt: true, user: { select: { id: true, name: true } } },
      })
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'CUSTOMER_FOLLOW_UP_CREATED', entity: 'CustomerFollowUp', entityId: followUp.id, metadata: { customerId, kind: followUp.kind } } })
      return followUp
    })
    return json(created, { status: 201 })
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo guardar el seguimiento.', 409) }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canWrite(session.user.role)) return error('No autorizado.', 403)
  const customerId = (params.id || '').trim().slice(0, 128)
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const id = text(body?.id, 128)
  if (!id) return error('Seguimiento obligatorio.')
  const selectedKind = kind(body?.kind)
  if (selectedKind === null) return error('Tipo de seguimiento inválido.')
  if (!validDate(body?.dueAt) || !validDate(body?.doneAt)) return error('Fecha de seguimiento inválida.')
  if (body?.note === undefined && selectedKind === undefined && body?.dueAt === undefined && body?.doneAt === undefined) return error('Nada para actualizar.')
  try {
    const existing = await prisma.customerFollowUp.findFirst({ where: { id, tenantId: session.user.tenantId, customerId }, select: { id: true, userId: true } })
    if (!existing) return error('Seguimiento no encontrado.', 404)
    if (existing.userId !== session.user.id && session.user.role !== 'ADMIN') return error('Solo el autor o un administrador puede editar el seguimiento.', 403)
    const updated = await prisma.$transaction(async tx => {
      const followUp = await tx.customerFollowUp.update({
        where: { id },
        data: {
          ...(body?.note !== undefined ? { note: text(body.note, 2000) || undefined } : {}),
          ...(selectedKind !== undefined ? { kind: selectedKind } : {}),
          ...(body?.dueAt !== undefined ? { dueAt: body.dueAt ? new Date(String(body.dueAt)) : null } : {}),
          ...(body?.doneAt !== undefined ? { doneAt: body.doneAt ? new Date(String(body.doneAt)) : null } : {}),
        },
        select: { id: true, kind: true, note: true, dueAt: true, doneAt: true, createdAt: true, user: { select: { id: true, name: true } } },
      })
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'CUSTOMER_FOLLOW_UP_UPDATED', entity: 'CustomerFollowUp', entityId: id, metadata: { customerId } } })
      return followUp
    })
    return json(updated)
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo actualizar el seguimiento.', 409) }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canWrite(session.user.role)) return error('No autorizado.', 403)
  const customerId = (params.id || '').trim().slice(0, 128)
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const id = text(body?.id, 128)
  if (!id) return error('Seguimiento obligatorio.')
  try {
    const existing = await prisma.customerFollowUp.findFirst({ where: { id, tenantId: session.user.tenantId, customerId }, select: { id: true, userId: true } })
    if (!existing) return error('Seguimiento no encontrado.', 404)
    if (existing.userId !== session.user.id && session.user.role !== 'ADMIN') return error('Solo el autor o un administrador puede eliminar el seguimiento.', 403)
    await prisma.$transaction(async tx => {
      await tx.customerFollowUp.delete({ where: { id } })
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'CUSTOMER_FOLLOW_UP_DELETED', entity: 'CustomerFollowUp', entityId: id, metadata: { customerId } } })
    })
    return json({ ok: true })
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo eliminar el seguimiento.', 409) }
}
