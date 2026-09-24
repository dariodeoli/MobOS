import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'

type RouteContext = { params: { id: string } }

// Mensajes de la tienda al cliente (#240 → portal): los escribe el equipo desde
// la ficha y el cliente los ve en su cuenta; el portal marca el visto/no visto.
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
  if (!customerId || !content) return error('El mensaje es obligatorio.')
  // Vencimiento opcional: los mensajes vencidos dejan de mostrarse en el portal.
  let expiresAt: Date | null = null
  if (typeof body?.expiresAt === 'string' && body.expiresAt.trim()) {
    const fecha = new Date(body.expiresAt)
    if (Number.isNaN(fecha.getTime())) return error('El vencimiento no es una fecha válida.')
    expiresAt = fecha
  }
  if (!(await findCustomer(session.user.tenantId, customerId))) return error('Cliente no encontrado.', 404)
  try {
    const created = await prisma.$transaction(async tx => {
      const aviso = await tx.customerNotice.create({
        data: { tenantId: session.user.tenantId, customerId, userId: session.user.id, content, expiresAt },
        select: { id: true, content: true, expiresAt: true, firstViewedAt: true, createdAt: true, user: { select: { id: true, name: true } } },
      })
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'CUSTOMER_NOTICE_CREATED', entity: 'CustomerNotice', entityId: aviso.id, metadata: { customerId } } })
      return aviso
    })
    return json(created, { status: 201 })
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo publicar el mensaje.', 409) }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canWrite(session.user.role)) return error('No autorizado.', 403)
  const customerId = (params.id || '').trim().slice(0, 128)
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const id = text(body?.id, 128)
  if (!id) return error('Mensaje obligatorio.')
  const existing = await prisma.customerNotice.findFirst({ where: { id, tenantId: session.user.tenantId, customerId }, select: { id: true } })
  if (!existing) return error('Mensaje no encontrado.', 404)
  await prisma.$transaction(async tx => {
    await tx.customerNotice.delete({ where: { id } })
    await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'CUSTOMER_NOTICE_DELETED', entity: 'CustomerNotice', entityId: id, metadata: { customerId } } })
  })
  return json({ ok: true })
}
