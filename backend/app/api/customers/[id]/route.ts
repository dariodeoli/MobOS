import { serializeCustomer } from '../../../../lib/customer-identity'
import { netPaid } from '../../../../lib/payment-net-pure'
import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { numero } from '../../../../lib/montos'
import { updateCustomer } from '../../../../lib/customer-service'

type RouteContext = { params: Promise<{ id: string }> }

// Perfil 360° del cliente: ficha, órdenes con saldo, deuda total, garantías
// de sus equipos, notas internas y seguimientos. El historial es el de toda la
// empresa (todas las sucursales), con el mismo alcance que el listado de
// clientes: el equipo atiende al cliente, no a la sucursal donde compró.
export async function GET(request: Request, props: RouteContext) {
  const params = await props.params;
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

  const orders = await prisma.order.findMany({
    where: {
      tenantId: session.user.tenantId,
      customerId: customer.id,
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
  const orderRows = orders.map(order => {
    const totalPyg = numero(order.totalPyg)
    const collectedPyg = netPaid(order.payments)
    const pendingPyg = order.status === 'CANCELLED' ? 0 : Math.max(0, totalPyg - collectedPyg)
    const serials = [...new Set(order.items.flatMap(item => (Array.isArray(item.serials) ? item.serials as string[] : [])))]
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      totalPyg,
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

  const [notes, billingIdentities, followUps, deviceReportShares, serviceOrders, customerNotices] = await Promise.all([
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
    // Seguimiento del informe compartido (#240 ítem 3): la ficha muestra
    // visto/no visto por equipo.
    prisma.deviceReportShare.findMany({
      where: { tenantId: session.user.tenantId, customerId: customer.id },
      select: { serial: true, channel: true, sharedAt: true, firstViewedAt: true, lastViewedAt: true, viewCount: true },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    }),
    // Servicio técnico (#240 §4): la ficha muestra las órdenes del taller del
    // cliente (estado, fechas y precio acordado).
    prisma.serviceOrder.findMany({
      where: { tenantId: session.user.tenantId, customerId: customer.id },
      select: { id: true, serviceNumber: true, device: true, serial: true, serviceName: true, status: true, receivedAt: true, deliveredAt: true, pricePyg: true, warrantyCaseId: true },
      orderBy: { receivedAt: 'desc' },
      take: 20,
    }),
    // Mensajes de la tienda al cliente (#240 → portal) con su visto/no visto.
    prisma.customerNotice.findMany({
      where: { tenantId: session.user.tenantId, customerId: customer.id },
      select: { id: true, content: true, expiresAt: true, firstViewedAt: true, lastViewedAt: true, createdAt: true, user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ])

  return json({
    customer: serializeCustomer(customer),
    orders: orderRows,
    debtPyg,
    warranties,
    notes,
    followUps,
    billingIdentities,
    deviceReportShares,
    serviceOrders,
    customerNotices,
  })
}

// Edición de la ficha: datos de contacto, tipo comercial y crédito. El tipo y
// el crédito quedan reservados a administración/gerencia.
export async function PATCH(request: Request, props: RouteContext) {
  const params = await props.params
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const id = (params.id || '').trim().slice(0, 128)
  if (!id) return error('Cliente obligatorio.')
  try {
    const body = await request.json() as Record<string, unknown>
    const result = await updateCustomer(prisma, { id: session.user.id, tenantId: session.user.tenantId, role: session.user.role, permissions: session.user.permissions }, id, body)
    return json(result)
  } catch (cause) {
    const code = (cause as { code?: string }).code
    const status = code === 'not_found' ? 404 : code === 'conflict' ? 409 : code === 'forbidden' ? 403 : 400
    return error(cause instanceof Error ? cause.message : 'No se pudo actualizar el cliente.', status)
  }
}
