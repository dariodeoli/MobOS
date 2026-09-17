import { prisma } from '../../../../../lib/prisma'
import { error, json, tenantId } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { InputError, objectInput, textInput } from '../../../../../lib/payment-input'
import { canAccessOrder, canProcessOrderReturn } from '../../../../../lib/orders'
import { consumeAuthorization, usableAuthorization } from '../../../../../lib/authorizations'
import { changeStock } from '../../../../../lib/stock'

// Anulación total de un pedido: marca el pedido como CANCELLED, restituye al
// stock las unidades serializadas que ya estaban vendidas y deja auditoría con
// el motivo. NO reembolsa pagos: los cobros quedan registrados como están y el
// saldo pendiente desaparece porque la deuda solo cuenta pedidos PENDING.
export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  try {
    const { orderId } = await context.params
    const body = objectInput(await request.json().catch(() => ({})))
    if (Object.keys(body).some(key => !['reason', 'authorizationId'].includes(key))) throw new InputError('La anulación contiene campos no admitidos.')
    const reason = textInput(body.reason, 'Motivo', 1000)
    if (reason.length < 3) throw new InputError('Indicá un motivo de al menos 3 caracteres.')
    // Gerencia y administración anulan directo; el resto necesita una
    // autorización ORDER_VOID aprobada, vigente (24 h) y sin usar.
    const canVoid = canProcessOrderReturn(session.user)
    let voidAuthorization: { id: string } | null = null
    if (!canVoid) {
      const rawAuthorizationId = body.authorizationId
      if (rawAuthorizationId === undefined || rawAuthorizationId === null || rawAuthorizationId === '') {
        throw new InputError('Tu rol no puede anular pedidos. Solicitá autorización a gerencia desde el pedido.', 403)
      }
      const authorizationId = textInput(rawAuthorizationId, 'authorizationId', 200)
      const authorization = await prisma.customerAuthorization.findFirst({ where: { id: authorizationId, tenantId: tenant, kind: 'ORDER_VOID', entity: 'ORDER', entityId: orderId } })
      voidAuthorization = { id: usableAuthorization(authorization, { userId: session.user.id, kinds: ['ORDER_VOID'], label: 'anulación' }).id }
    }
    const result = await prisma.$transaction(async tx => {
      const order = await tx.order.findFirst({ where: { id: orderId, tenantId: tenant }, include: { items: true, payments: true } })
      if (!order || !canAccessOrder(session.user, order)) throw new InputError('Pedido no encontrado.', 404)
      if (order.status === 'CANCELLED') throw new InputError('Este pedido ya fue anulado o cancelado.', 409)
      // Restitución de stock: las unidades serializadas vuelven a disponible y
      // el contador agregado suma lo que la venta había descontado. Las líneas
      // sin seriales reponen su cantidad; lo que quedó "sobre pedido" nunca
      // descontó stock y no se repone.
      let restoredUnits = 0
      for (const item of order.items) {
        const serials = Array.isArray(item.serials) ? item.serials as string[] : []
        if (serials.length && item.productId) {
          const units = await tx.inventoryUnit.findMany({ where: { tenantId: tenant, productId: item.productId, serial: { in: serials } }, select: { id: true, branchId: true, status: true } })
          for (const unit of units) {
            if (unit.status !== 'SOLD') continue
            await tx.inventoryUnit.update({ where: { id: unit.id }, data: { status: 'AVAILABLE', reservedUntil: null, reservationCustomer: null, reservedById: null } })
            await changeStock(tx, { tenantId: tenant, productId: item.productId, delta: 1, branchId: unit.branchId, includeBranchless: true, message: 'No se pudo reponer el stock de la unidad anulada.' })
            restoredUnits += 1
          }
        } else if (item.productId && item.serialsPending === 0) {
          await changeStock(tx, { tenantId: tenant, productId: item.productId, delta: item.quantity, branchId: order.branchId, includeBranchless: true, message: 'No se pudo reponer el stock de la venta anulada.' })
          restoredUnits += item.quantity
        }
      }
      if (voidAuthorization) {
        // Consumo atómico dentro de la anulación: la autorización es de un
        // solo uso y un reintento no puede reutilizarla.
        await consumeAuthorization(tx, { id: voidAuthorization.id, tenantId: tenant, kinds: ['ORDER_VOID'], userId: session.user.id, label: 'anulación', usedByOrderId: order.id })
      }
      const updated = await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' }, include: { items: true, payments: true, customer: true, seller: { select: { id: true, name: true } } } })
      await tx.auditLog.create({ data: {
        tenantId: tenant, userId: session.user.id, action: 'ORDER_VOIDED', entity: 'Order', entityId: order.id,
        metadata: {
          reason,
          authorizationId: voidAuthorization?.id ?? null,
          approvedRole: canVoid ? session.user.role : null,
          restoredUnits,
          // Los pagos no se borran ni se reembolsan (decisión del pedido):
          // quedan intactos y el saldo pendiente desaparece al pasar a CANCELLED.
          paymentsKept: order.payments.length,
          refundedPyg: 0,
          pendingDebt: 0,
        },
      } })
      return { id: updated.id, orderNumber: updated.orderNumber, status: updated.status, restoredUnits, refundedPyg: 0, paymentsKept: order.payments.length }
    })
    return json(result)
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo anular el pedido.', cause instanceof InputError ? cause.status : 400)
  }
}
