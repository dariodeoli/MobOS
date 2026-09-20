import { prisma } from '../../../lib/prisma'
import { requireSession } from '../../../lib/auth'
import { error, json } from '../../../lib/http'
import { InputError, objectInput, textInput } from '../../../lib/payment-input'
import { promotionInput } from '../../../lib/promotions'

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const now = new Date()
  return json(await prisma.promotion.findMany({ where: { tenantId: session.user.tenantId, ...(session.user.role === 'ADMIN' ? {} : { isActive: true, startsAt: { lte: now }, endsAt: { gt: now } }) }, orderBy: { createdAt: 'desc' } }))
}
export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('Solo el administrador configura promociones.', 403)
  try {
    const data = promotionInput(await request.json())
    if (data.productId && !await prisma.product.findFirst({ where: { id: data.productId, tenantId: session.user.tenantId, isActive: true } })) return error('Producto no encontrado.', 404)
    return json(await prisma.promotion.create({ data: { ...data, tenantId: session.user.tenantId } }).then(async (promocion) => { await prisma.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'PROMOTION_CREATED', entity: 'Promotion', entityId: promocion.id, metadata: { name: promocion.name } } }); return promocion }), { status: 201 })
  } catch (e) { return error(e instanceof InputError ? e.message : 'Datos inválidos o código ya existente.', 400) }
}
export async function PATCH(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('Solo el administrador configura promociones.', 403)
  try {
    const b = objectInput(await request.json())
    if (Object.keys(b).some(k => !['id', 'isActive'].includes(k)) || typeof b.isActive !== 'boolean') throw new InputError('Enviá id e isActive.')
    const id = textInput(b.id, 'Promoción', 200)
    const result = await prisma.promotion.updateMany({ where: { id, tenantId: session.user.tenantId }, data: { isActive: b.isActive } })
    return result.count ? json({ id, isActive: b.isActive }) : error('Promoción no encontrada.', 404)
  } catch (e) { return error(e instanceof InputError ? e.message : 'Datos inválidos.', 400) }
}
