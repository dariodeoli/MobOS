import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { InputError, objectInput, textInput } from '../../../../lib/payment-input'

type RouteContext = { params: { id: string } }

// Perfil 360° del cliente: ficha, órdenes con saldo, deuda total, garantías
// de sus equipos, notas internas y seguimientos. VENDEDOR solo ve clientes con
// alguna orden en su sucursal; ADMIN/GERENTE ven todos los clientes de la
// empresa (el mismo alcance abierto que el listado de clientes).
export async function GET(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const id = (params.id || '').trim().slice(0, 128)
  if (!id) return error('Cliente obligatorio.')

  const customer = await prisma.customer.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: {
      addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] },
      createdBy: { select: { id: true, name: true } },
    },
  })
  if (!customer) return error('Cliente no encontrado.', 404)

  const sellerBranchId = session.user.role === 'VENDEDOR' ? session.user.branchId : null
  const branchId = session.user.role === 'GERENTE' ? null : sellerBranchId

  const orders = await prisma.order.findMany({
    where: {
      tenantId: session.user.tenantId,
      customerId: customer.id,
      ...(branchId ? { branchId } : {}),
    },
    include: {
      items: { select: { id: true, description: true, quantity: true, totalPyg: true, serials: true } },
      payments: { select: { status: true, amountPyg: true } },
      branch: { select: { id: true, name: true } },
      seller: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  if (branchId && !orders.length) return error('No autorizado para esa sucursal.', 403)

  const orderRows = orders.map(order => {
    const collectedPyg = order.payments.filter(payment => payment.status === 'CONFIRMED').reduce((sum, payment) => sum + payment.amountPyg, 0)
    const pendingPyg = Math.max(0, order.totalPyg - collectedPyg)
    const serials = [...new Set(order.items.flatMap(item => (Array.isArray(item.serials) ? item.serials as string[] : [])))]
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      totalPyg: order.totalPyg,
      collectedPyg,
      pendingPyg,
      createdAt: order.createdAt,
      status: order.status,
      branch: order.branch ? { id: order.branch.id, name: order.branch.name } : null,
      seller: order.seller ? { id: order.seller.id, name: order.seller.name } : null,
      serials,
      items: order.items.map(item => ({ id: item.id, description: item.description, quantity: item.quantity, serials: Array.isArray(item.serials) ? item.serials as string[] : [] })),
    }
  })
  const debtPyg = orderRows.reduce((sum, order) => sum + order.pendingPyg, 0)

  const serials = [...new Set(orderRows.flatMap(order => order.serials))]
  const warranties = await prisma.warrantyCase.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...(branchId ? { branchId } : {}),
      OR: [
        { customerId: customer.id },
        { customerName: customer.name },
        ...(serials.length ? [{ serial: { in: serials } }] : []),
      ],
    },
    select: { id: true, serial: true, customerName: true, description: true, status: true, branchId: true, createdAt: true, updatedAt: true, expiresAt: true, warrantyDays: true, publicToken: true, branch: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const [notes, billingIdentities, followUps] = await Promise.all([
    prisma.customerNote.findMany({
      where: { tenantId: session.user.tenantId, customerId: customer.id },
      select: { id: true, content: true, createdAt: true, user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.customerBillingIdentity.findMany({
      where: { tenantId: session.user.tenantId, customerId: customer.id },
      select: { id: true, name: true, document: true, uses: true, lastUsedAt: true },
      orderBy: [{ uses: 'desc' }, { lastUsedAt: 'desc' }],
      take: 20,
    }),
    prisma.customerFollowUp.findMany({
      where: { tenantId: session.user.tenantId, customerId: customer.id },
      select: { id: true, kind: true, note: true, dueAt: true, doneAt: true, createdAt: true, user: { select: { id: true, name: true } } },
      orderBy: [{ doneAt: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    }),
  ])

  return json({
    customer,
    orders: orderRows,
    debtPyg,
    warranties,
    notes,
    followUps,
    billingIdentities,
  })
}

// Edición de la ficha: datos de contacto, tipo comercial y crédito. El tipo y
// el crédito quedan reservados a administración/gerencia.
export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const id = (params.id || '').trim().slice(0, 128)
  if (!id) return error('Cliente obligatorio.')
  const existing = await prisma.customer.findFirst({ where: { id, tenantId: session.user.tenantId }, select: { id: true } })
  if (!existing) return error('Cliente no encontrado.', 404)
  try {
    const body = objectInput(await request.json())
    const gestionaCredito = ['ADMIN', 'GERENTE'].includes(session.user.role)
    const data: Record<string, unknown> = {}
    if (body.name !== undefined) data.name = textInput(body.name, 'Nombre', 200)
    if (body.document !== undefined) data.document = typeof body.document === 'string' && body.document.trim() ? body.document.trim().slice(0, 100) : null
    if (body.phone !== undefined) data.phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim().slice(0, 100) : null
    if (body.countryCode !== undefined) data.countryCode = typeof body.countryCode === 'string' && /^\+\d{1,4}$/.test(body.countryCode) ? body.countryCode : '+595'
    if (body.email !== undefined) data.email = typeof body.email === 'string' && body.email.trim() ? body.email.trim().slice(0, 200) : null
    if (body.notes !== undefined) data.notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 2000) : null
    if (body.publicNote !== undefined) data.publicNote = typeof body.publicNote === 'string' && body.publicNote.trim() ? body.publicNote.trim().slice(0, 2000) : null
    if (body.tags !== undefined) data.tags = Array.isArray(body.tags) ? body.tags.filter(tag => typeof tag === 'string' && tag.trim()).map(tag => tag.trim().slice(0, 50)).slice(0, 20) : []
    if (body.pricingTier !== undefined) {
      if (!gestionaCredito) throw new InputError('Solo administración o gerencia pueden cambiar el tipo de cliente.', 403)
      data.pricingTier = body.pricingTier === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL'
    }
    if (body.creditDays !== undefined) {
      if (!gestionaCredito) throw new InputError('Solo administración o gerencia pueden cambiar el crédito.', 403)
      const days = body.creditDays === null || body.creditDays === '' ? null : Number(body.creditDays)
      if (days !== null && (!Number.isSafeInteger(days) || days < 0 || days > 365)) throw new InputError('Plazo de crédito inválido (0 a 365 días).')
      data.creditDays = days
    }
    if (body.creditLimitPyg !== undefined) {
      if (!gestionaCredito) throw new InputError('Solo administración o gerencia pueden cambiar el crédito.', 403)
      const limit = body.creditLimitPyg === null || body.creditLimitPyg === '' ? null : Number(body.creditLimitPyg)
      if (limit !== null && (!Number.isSafeInteger(limit) || limit < 0 || limit > 2147483647)) throw new InputError('Límite de crédito inválido.')
      data.creditLimitPyg = limit
    }
    if (!Object.keys(data).length) throw new InputError('No enviaste cambios.')
    const updated = await prisma.customer.update({ where: { id: existing.id }, data, include: { addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] } } })
    await prisma.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'CUSTOMER_UPDATED', entity: 'Customer', entityId: updated.id, metadata: { fields: Object.keys(data) } } })
    return json(updated)
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo actualizar el cliente.', 400)
  }
}
