import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'

type RouteContext = { params: { id: string } }

const canWrite = (role: string) => ['ADMIN', 'GERENTE', 'VENDEDOR'].includes(role)
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''

async function findCustomer(tenant: string, customerId: string) {
  return prisma.customer.findFirst({ where: { id: customerId, tenantId: tenant }, select: { id: true } })
}

export async function POST(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canWrite(session.user.role)) return error('No autorizado.', 403)
  const customerId = (params.id || '').trim().slice(0, 128)
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const content = text(body?.content, 2000)
  if (!customerId || !content) return error('El contenido de la nota es obligatorio.')
  if (!(await findCustomer(session.user.tenantId, customerId))) return error('Cliente no encontrado.', 404)
  try {
    const created = await prisma.$transaction(async tx => {
      const note = await tx.customerNote.create({ data: { tenantId: session.user.tenantId, customerId, userId: session.user.id, content }, select: { id: true, content: true, createdAt: true, user: { select: { id: true, name: true } } } })
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'CUSTOMER_NOTE_CREATED', entity: 'CustomerNote', entityId: note.id, metadata: { customerId } } })
      return note
    })
    return json(created, { status: 201 })
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo guardar la nota.', 409) }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canWrite(session.user.role)) return error('No autorizado.', 403)
  const customerId = (params.id || '').trim().slice(0, 128)
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const id = text(body?.id, 128)
  const content = text(body?.content, 2000)
  if (!id || !content) return error('Nota y contenido son obligatorios.')
  try {
    const existing = await prisma.customerNote.findFirst({ where: { id, tenantId: session.user.tenantId, customerId }, select: { id: true, userId: true } })
    if (!existing) return error('Nota no encontrada.', 404)
    if (existing.userId !== session.user.id && session.user.role !== 'ADMIN') return error('Solo el autor o un administrador puede editar la nota.', 403)
    const updated = await prisma.$transaction(async tx => {
      const note = await tx.customerNote.update({ where: { id }, data: { content }, select: { id: true, content: true, createdAt: true, user: { select: { id: true, name: true } } } })
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'CUSTOMER_NOTE_UPDATED', entity: 'CustomerNote', entityId: id, metadata: { customerId } } })
      return note
    })
    return json(updated)
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo actualizar la nota.', 409) }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canWrite(session.user.role)) return error('No autorizado.', 403)
  const customerId = (params.id || '').trim().slice(0, 128)
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const id = text(body?.id, 128)
  if (!id) return error('Nota obligatoria.')
  try {
    const existing = await prisma.customerNote.findFirst({ where: { id, tenantId: session.user.tenantId, customerId }, select: { id: true, userId: true } })
    if (!existing) return error('Nota no encontrada.', 404)
    if (existing.userId !== session.user.id && session.user.role !== 'ADMIN') return error('Solo el autor o un administrador puede eliminar la nota.', 403)
    await prisma.$transaction(async tx => {
      await tx.customerNote.delete({ where: { id } })
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'CUSTOMER_NOTE_DELETED', entity: 'CustomerNote', entityId: id, metadata: { customerId } } })
    })
    return json({ ok: true })
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo eliminar la nota.', 409) }
}
