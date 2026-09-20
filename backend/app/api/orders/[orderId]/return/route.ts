import { prisma } from '../../../../../lib/prisma'
import { error, json, tenantId } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { InputError, objectInput } from '../../../../../lib/payment-input'
import { changeStock, recomputeStock } from '../../../../../lib/stock'
import { canAccessOrder, canProcessOrderReturn } from '../../../../../lib/orders'
import { inventoryStatusFor, planReposicion, resolveRefundPyg, returnRequest, type RestockDecision } from '../../../../../lib/returns'

// La devolución financiera se conserva en la orden original. La reposición de
// stock es una decisión explícita del mostrador —por unidad cuando la venta
// tiene seriales— y puede volver a la venta, quedar en revisión (defectuoso) o
// no tocarse. El reembolso puede salir en efectivo/cuenta o quedar como saldo a
// favor del cliente (nota de crédito); una devolución completa cancela el
// pedido y con eso la comisión del vendedor deja de liquidarse.
export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canProcessOrderReturn(session.user)) return error('Tu rol no puede registrar devoluciones o cambios.', 403)
  try {
    const { orderId } = await context.params
    const requestData = returnRequest(objectInput(await request.json()))
    const result = await prisma.$transaction(async tx => {
      const order = await tx.order.findFirst({ where: { id: orderId, tenantId: tenant }, include: { payments: true, items: true } })
      if (!order || !canAccessOrder(session.user, order)) throw new InputError('Pedido no encontrado.', 404)
      if (order.status === 'CANCELLED') throw new InputError('Este pedido ya fue devuelto o cancelado.', 409)
      let replacementOrderId = requestData.replacementOrderId
      if (!replacementOrderId && requestData.replacementOrderNumber) {
        const replacement = await tx.order.findFirst({ where: { tenantId: tenant, orderNumber: requestData.replacementOrderNumber }, select: { id: true } })
        if (!replacement) throw new InputError('El número de pedido de cambio no pertenece a esta empresa.', 404)
        replacementOrderId = replacement.id
      }
      if (replacementOrderId) {
        const replacement = await tx.order.findFirst({ where: { id: replacementOrderId, tenantId: tenant }, select: { id: true } })
        if (!replacement) throw new InputError('El pedido de cambio no pertenece a esta empresa.', 404)
      }
      const confirmed = order.payments.filter(payment => payment.status === 'CONFIRMED').reduce((sum, payment) => sum + payment.amountPyg, 0)
      // Lo ya devuelto no se puede volver a devolver: los reembolsos pagados y
      // las notas de crédito emitidas por esta venta descuentan del tope.
      const refundedBefore = order.payments.filter(payment => payment.status === 'REFUNDED').reduce((sum, payment) => sum + payment.amountPyg, 0)
      const creditedBefore = (await tx.storeCredit.aggregate({ where: { tenantId: tenant, orderId: order.id }, _sum: { amountPyg: true } }))._sum.amountPyg || 0
      const refundablePyg = Math.max(0, confirmed - refundedBefore - creditedBefore)
      // Reembolso total por defecto en devoluciones y cancelaciones; parcial
      // permitido (0..lo devolvible). El cobro neto baja porque el pago queda
      // registrado como REFUNDED y no suma a lo confirmado.
      const refundPyg = resolveRefundPyg({ operation: requestData.operation, confirmedPyg: refundablePyg, requestedPyg: requestData.refundPyg })
      let storeCreditId: string | null = null
      if (refundPyg > 0 && requestData.refundMode === 'CREDIT') {
        // Nota de crédito interna: la deuda de la tienda con el cliente queda
        // disponible para futuras compras en vez de salir como efectivo.
        if (!order.customerId) throw new InputError('Para dejar saldo a favor el pedido necesita un cliente identificado.', 409)
        const credit = await tx.storeCredit.create({ data: { tenantId: tenant, customerId: order.customerId, orderId: order.id, amountPyg: refundPyg, remainingPyg: refundPyg, note: `${requestData.operation === 'CANCEL' ? 'Cancelación' : 'Devolución'}: ${requestData.reason.slice(0, 160)}`, createdById: session.user.id } })
        storeCreditId = credit.id
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'STORE_CREDIT_ISSUED', entity: 'StoreCredit', entityId: credit.id, metadata: { orderId: order.id, customerId: order.customerId, amountPyg: refundPyg, origin: requestData.operation } } })
      } else if (refundPyg > 0) {
        const metodo = order.payments.find(payment => payment.status === 'CONFIRMED')?.method ?? 'CASH'
        await tx.payment.create({ data: { tenantId: tenant, method: metodo, status: 'REFUNDED', amountPyg: refundPyg, orderId: order.id, reference: `Reembolso ${requestData.operation === 'CANCEL' ? 'por cancelación' : 'por devolución'}: ${requestData.reason.slice(0, 120)}`, paidAt: new Date(), createdAt: new Date() } })
      }
      // Reposición de stock: cada serial vuelve a la venta o queda en revisión
      // según su propia decisión (o la general del mostrador), con recálculo del
      // contador agregado por producto.
      const plan = planReposicion({
        restock: requestData.restock,
        units: requestData.restockUnits,
        items: order.items.map(item => ({ productId: item.productId, serials: Array.isArray(item.serials) ? item.serials as string[] : [] })),
      })
      const porProductoYEstado = new Map<string, { productId: string; status: 'AVAILABLE' | 'DEFECTIVE'; serials: string[] }>()
      const agrupar = (entradas: typeof plan.available, decision: RestockDecision) => {
        for (const entrada of entradas) {
          const key = `${entrada.productId}:${decision}`
          const grupo = porProductoYEstado.get(key) ?? { productId: entrada.productId, status: inventoryStatusFor(decision), serials: [] }
          grupo.serials.push(entrada.serial)
          porProductoYEstado.set(key, grupo)
        }
      }
      agrupar(plan.available, 'AVAILABLE')
      agrupar(plan.review, 'REVIEW')
      let restockedUnits = 0
      const repuestos = { available: plan.available.length, review: plan.review.length }
      for (const grupo of porProductoYEstado.values()) {
        const changed = await tx.inventoryUnit.updateMany({ where: { tenantId: tenant, productId: grupo.productId, serial: { in: grupo.serials }, status: 'SOLD' }, data: { status: grupo.status } })
        restockedUnits += changed.count
        if (changed.count) await recomputeStock(tx, tenant, grupo.productId)
      }
      // Ítems sin seriales: solo se repone si el producto no maneja unidades
      // físicas (los tramos "sobre pedido" nunca descontaron stock).
      if (plan.fallback !== 'NONE') {
        for (const item of order.items) {
          if (!item.productId) continue
          const serials = Array.isArray(item.serials) ? item.serials as string[] : []
          if (serials.length) continue
          const tracked = await tx.inventoryUnit.count({ where: { tenantId: tenant, productId: item.productId } })
          if (!tracked && item.quantity > 0) {
            await changeStock(tx, { tenantId: tenant, productId: item.productId, delta: item.quantity, message: 'No se pudo reponer el stock devuelto.' })
            restockedUnits += item.quantity
          }
        }
      }
      const isFullRefund = (requestData.operation === 'RETURN' || requestData.operation === 'CANCEL') && refundPyg === refundablePyg
      if (isFullRefund) {
        await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } })
      }
      const action = requestData.operation === 'RETURN' ? 'ORDER_RETURN_RECORDED' : requestData.operation === 'CANCEL' ? 'ORDER_CANCELLED' : 'ORDER_EXCHANGE_RECORDED'
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action, entity: 'Order', entityId: order.id, metadata: { reason: requestData.reason, refundPyg, refundMode: requestData.refundMode, storeCreditId, restock: requestData.restock, restockAvailable: repuestos.available, restockReview: repuestos.review, restockedUnits, replacementOrderId: replacementOrderId ?? null, sellerId: order.sellerId, commissionReverted: isFullRefund, financialStatus: storeCreditId ? 'STORE_CREDIT' : refundPyg > 0 ? 'REFUNDED' : 'NO_FINANCIAL_CHANGE' } } })
      return { id: order.id, operation: requestData.operation, refundedPyg: refundPyg, refundMode: requestData.refundMode, storeCreditId, restockedUnits, restock: repuestos, commissionReverted: isFullRefund, status: isFullRefund ? 'CANCELLED' : order.status }
    })
    return json(result)
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo registrar la postventa.', cause instanceof InputError ? cause.status : 400) }
}
