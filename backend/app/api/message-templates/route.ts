import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

const defaults = [
  ['ready_for_pickup', 'Pedido listo para retirar', 'Hola, {{customer_name}}. Tu pedido {{order_number}} ya está listo para retirar en {{branch_name}}.'],
  ['arrived_from_depot', 'Pedido llegó a sucursal', 'Hola, {{customer_name}}. Tu pedido {{order_number}} ya llegó a {{branch_name}}. Te avisamos cuando esté listo para retirar.'],
  ['reservation', 'Reserva confirmada', 'Hola, {{customer_name}}. Reservamos tu pedido {{order_number}} hasta {{reservation_until}}.'],
]
export async function GET(request: Request) {
  const session = await requireSession(request); if (!session) return error('Falta sesión.', 401)
  const tenantId = session.user.tenantId
  await prisma.$transaction(defaults.map(([key, name, body]) => prisma.messageTemplate.upsert({ where: { tenantId_key: { tenantId, key } }, create: { tenantId, key, name, body }, update: {} })))
  return json(await prisma.messageTemplate.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }))
}
export async function PATCH(request: Request) {
  const session = await requireSession(request); if (!session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE'].includes(session.user.role)) return error('No autorizado.', 403)
  const body = await request.json(); const id = typeof body.id === 'string' ? body.id : ''
  if (!id || typeof body.body !== 'string' || !body.body.trim() || body.body.length > 1200) return error('Plantilla y mensaje de hasta 1.200 caracteres son obligatorios.')
  const updated = await prisma.messageTemplate.updateMany({ where: { id, tenantId: session.user.tenantId }, data: { body: body.body.trim(), ...(typeof body.name === 'string' && body.name.trim() ? { name: body.name.trim().slice(0, 120) } : {}), ...(typeof body.isActive === 'boolean' ? { isActive: body.isActive } : {}) } })
  if (!updated.count) return error('Plantilla no encontrada.', 404)
  return json({ ok: true })
}
