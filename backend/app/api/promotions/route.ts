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
  const tenantId = session.user.tenantId
  try {
    const data = promotionInput(await request.json())
    if (data.productId && !await prisma.product.findFirst({ where: { id: data.productId, tenantId, isActive: true } })) return error('Producto no encontrado.', 404)
    const promocion = await prisma.$transaction(async tx => {
      const creada = await tx.promotion.create({ data: { ...data, tenantId } })
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: session.user.id,
          action: 'PROMOTION_CREATED',
          entity: 'Promotion',
          entityId: creada.id,
          metadata: { code: creada.code, name: creada.name, kind: creada.kind, value: creada.value, maxUnits: creada.maxUnits, ...(creada.productId ? { productId: creada.productId } : {}) },
        },
      })
      return creada
    })
    return json(promocion, { status: 201 })
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
    const isActive = b.isActive
    const tenantId = session.user.tenantId
    const aplicado = await prisma.$transaction(async tx => {
      const cambio = await tx.promotion.updateMany({ where: { id, tenantId }, data: { isActive } })
      if (!cambio.count) return false
      const promocion = await tx.promotion.findFirst({ where: { id, tenantId }, select: { code: true, name: true } })
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: session.user.id,
          action: isActive ? 'PROMOTION_ACTIVATED' : 'PROMOTION_DEACTIVATED',
          entity: 'Promotion',
          entityId: id,
          metadata: { ...(promocion ? { code: promocion.code, name: promocion.name } : {}) },
        },
      })
      return true
    })
    return aplicado ? json({ id, isActive }) : error('Promoción no encontrada.', 404)
  } catch (e) { return error(e instanceof InputError ? e.message : 'Datos inválidos.', 400) }
}
