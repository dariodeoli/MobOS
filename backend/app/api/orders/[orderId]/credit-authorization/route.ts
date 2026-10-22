import { prisma } from '../../../../../lib/prisma'
import { error, json, tenantId } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { InputError, objectInput, textInput } from '../../../../../lib/payment-input'
import { canAccessOrder } from '../../../../../lib/orders'
import { numero } from '../../../../../lib/montos'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import {
  creditAuthorizationsFor,
  creditedBackPyg,
  createCreditHold,
  evaluateCreditSale,
  isCreditResolverRole,
  lockCustomerCredit,
  notifyCreditHold,
  recordCreditApproval,
  resolveCreditAuthorization,
  verifyApproverPin,
  type CreditApprover,
} from '../../../../../lib/credit-authorization'

// Autorización de crédito de un pedido que superó el crédito del cliente.
//   approve → un administrador/gerente (su sesión) o cualquier vendedor con el
//             PIN de uno de ellos; deja auditoría con quién aprobó y el monto.
//   reject  → idem, con motivo obligatorio; el pedido sigue sin poder entregarse.
//   request → el vendedor pide la autorización de un pedido que todavía no la
//             tiene (pedido viejo o entrega con saldo que superaría el límite).
export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const limited = enforceRateLimit(request, 'credit-authorization', 30, 60_000)
  if (limited) return limited
  try {
    const { orderId } = await context.params
    const body = objectInput(await request.json().catch(() => ({})))
    if (Object.keys(body).some(key => !['action', 'pin', 'note'].includes(key))) throw new InputError('Campo no admitido.')
    const action = textInput(body.action, 'Acción', 20)
    if (!['approve', 'reject', 'request'].includes(action)) throw new InputError('Acción inválida.')
    const note = body.note === undefined || body.note === null || body.note === '' ? null : textInput(body.note, 'Motivo', 500)
    const order = await prisma.order.findFirst({ where: { id: orderId, tenantId: tenant }, select: { id: true, orderNumber: true, status: true, sellerId: true, branchId: true, customerId: true, totalPyg: true } })
    if (!order || !canAccessOrder(session.user, order)) return error('Pedido no encontrado.', 404)
    if (order.status === 'CANCELLED') throw new InputError('El pedido está anulado.', 409)
    if (!order.customerId) throw new InputError('El pedido no tiene cliente: no hay crédito que autorizar.', 409)
    const customerId = order.customerId

    const latest = (await creditAuthorizationsFor(prisma, tenant, [order.id])).get(order.id) ?? null

    if (action === 'request') {
      if (latest?.status === 'PENDING' || latest?.status === 'APPROVED') return json({ creditAuthorization: latest })
      const created = await prisma.$transaction(async tx => {
        const cobrado = await tx.payment.aggregate({ where: { tenantId: tenant, orderId: order.id, status: 'CONFIRMED' }, _sum: { amountPyg: true } })
        const saldo = Math.max(0, numero(order.totalPyg) - numero(cobrado._sum.amountPyg) - (await creditedBackPyg(tx, tenant, order.id)))
        if (saldo <= 0) throw new InputError('El pedido no tiene saldo: no hace falta autorización de crédito.', 409)
        const posicion = await lockCustomerCredit(tx, tenant, customerId, order.id)
        const evaluation = evaluateCreditSale({ limitPyg: posicion.limitPyg, debtPyg: posicion.debtPyg, unpaidPyg: saldo, tolerancePct: posicion.tolerancePct })
        if (!evaluation.requiresAuthorization) throw new InputError('El cliente tiene crédito disponible para este saldo: no hace falta autorización.', 409)
        return createCreditHold(tx, { tenantId: tenant, orderId: order.id, orderNumber: order.orderNumber, customerId, requestedById: session.user.id, evaluation, note })
      })
      await notifyCreditHold({ tenantId: tenant, orderId: order.id, authorizationId: created, branchId: order.branchId })
      const actual = (await creditAuthorizationsFor(prisma, tenant, [order.id])).get(order.id) ?? null
      return json({ creditAuthorization: actual }, { status: 201 })
    }

    // approve / reject: quién resuelve. Un administrador o gerente con su
    // sesión; cualquier otro rol, con el PIN de uno de ellos.
    const pinGiven = body.pin !== undefined && body.pin !== null && body.pin !== ''
    let approver: CreditApprover
    let via: 'SESSION' | 'PIN'
    if (pinGiven) {
      approver = await verifyApproverPin({ tenantId: tenant, requesterId: session.user.id, pin: body.pin })
      via = 'PIN'
    } else if (isCreditResolverRole(session.user.role)) {
      approver = { id: session.user.id, name: session.user.name, role: session.user.role }
      via = 'SESSION'
    } else {
      throw new InputError('Solo administración o gerencia pueden autorizar el crédito. Ingresá su PIN.', 403)
    }
    if (action === 'reject' && !note) throw new InputError('Indicá el motivo del rechazo.')

    if (!latest || latest.status !== 'PENDING') {
      if (action === 'reject') throw new InputError(latest ? 'La autorización de crédito ya fue resuelta.' : 'Este pedido no tiene una autorización de crédito pendiente.', 409)
      if (latest?.status === 'APPROVED') throw new InputError('La autorización de crédito ya fue aprobada.', 409)
      // Sin solicitud previa (pedido viejo): se aprueba directo si de verdad supera el crédito.
      await prisma.$transaction(async tx => {
        const cobrado = await tx.payment.aggregate({ where: { tenantId: tenant, orderId: order.id, status: 'CONFIRMED' }, _sum: { amountPyg: true } })
        const saldo = Math.max(0, numero(order.totalPyg) - numero(cobrado._sum.amountPyg) - (await creditedBackPyg(tx, tenant, order.id)))
        const posicion = await lockCustomerCredit(tx, tenant, customerId, order.id)
        const evaluation = evaluateCreditSale({ limitPyg: posicion.limitPyg, debtPyg: posicion.debtPyg, unpaidPyg: saldo, tolerancePct: posicion.tolerancePct })
        if (!evaluation.requiresAuthorization) throw new InputError('El cliente tiene crédito disponible para este saldo: no hace falta autorización.', 409)
        await recordCreditApproval(tx, { tenantId: tenant, orderId: order.id, orderNumber: order.orderNumber, customerId, requestedById: session.user.id, evaluation, approver, via })
      })
    } else {
      await prisma.$transaction(tx => resolveCreditAuthorization(tx, { tenantId: tenant, orderId: order.id, orderNumber: order.orderNumber, authorizationId: latest.id, action: action as 'approve' | 'reject', approver, performedById: session.user.id, via, note }))
    }
    const actual = (await creditAuthorizationsFor(prisma, tenant, [order.id])).get(order.id) ?? null
    return json({ creditAuthorization: actual })
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo resolver la autorización de crédito.', cause instanceof InputError ? cause.status : 400)
  }
}
