import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'

const DAY_MS = 86400000

// Crea un plan de cuotas a crédito para el saldo pendiente de la orden:
// N pagos PENDING con vencimiento mensual. Un solo plan por orden.
export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE', 'CAJERA'].includes(session.user.role)) return error('Tu rol no puede crear planes de crédito.', 403)
  let body: any; try { body = await request.json() } catch { return error('JSON inválido.') }
  const count = Number(body.count)
  if (!Number.isInteger(count) || count < 2 || count > 24) return error('La cantidad de cuotas debe ser un entero entre 2 y 24.')
  const firstDueAt = body.firstDueAt ? new Date(String(body.firstDueAt)) : new Date(Date.now() + 30 * DAY_MS)
  if (!Number.isFinite(firstDueAt.getTime()) || firstDueAt.getTime() <= Date.now()) return error('La primera cuota debe vencer en el futuro.')
  const { orderId } = await context.params
  try {
    const payments = await prisma.$transaction(async tx => {
      const order = await tx.order.findFirst({ where: { id: orderId, tenantId: session.user.tenantId }, include: { payments: true } })
      if (!order) throw new Error('Pedido no encontrado.')
      if (order.status === 'CANCELLED') throw new Error('Este pedido está cancelado.')
      const confirmed = order.payments.filter((payment) => payment.status === 'CONFIRMED').reduce((sum, payment) => sum + payment.amountPyg, 0)
      const pending = Math.max(0, order.totalPyg - confirmed)
      if (pending <= 0) throw new Error('Este pedido no tiene saldo pendiente.')
      if (order.payments.some((payment) => payment.status === 'PENDING' && payment.dueAt)) throw new Error('Ya existe un plan de cuotas para este pedido.')
      const base = Math.floor(pending / count)
      const cuotas = Array.from({ length: count }, (_, index) => ({
        tenantId: session.user.tenantId, orderId: order.id, method: 'CREDIT' as const, status: 'PENDING' as const,
        amountPyg: index === count - 1 ? pending - base * (count - 1) : base,
        reference: `Cuota ${index + 1}/${count}`,
        dueAt: new Date(firstDueAt.getTime() + index * 30 * DAY_MS),
        paidAt: new Date(),
      }))
      const created = []
      for (const cuota of cuotas) created.push(await tx.payment.create({ data: cuota }))
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'CREDIT_PLAN_CREATED', entity: 'Order', entityId: order.id, metadata: { count, firstDueAt: firstDueAt.toISOString(), totalPyg: pending } } })
      return created
    })
    return json({ count: payments.length, payments }, { status: 201 })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'No se pudo crear el plan de cuotas.'
    if (/no encontrado/i.test(message)) return error(message, 404)
    if (/cuotas|saldo|cancelado/i.test(message)) return error(message, 409)
    return error(message, 500)
  }
}
