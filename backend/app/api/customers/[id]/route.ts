import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'

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
    include: { addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] } },
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
    }
  })
  const debtPyg = orderRows.reduce((sum, order) => sum + order.pendingPyg, 0)

  const serials = [...new Set(orderRows.flatMap(order => order.serials))]
  const warranties = await prisma.warrantyCase.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...(branchId ? { branchId } : {}),
      OR: [
        { customerName: customer.name },
        ...(serials.length ? [{ serial: { in: serials } }] : []),
      ],
    },
    select: { id: true, serial: true, customerName: true, description: true, status: true, branchId: true, createdAt: true, updatedAt: true, branch: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const [notes, followUps] = await Promise.all([
    prisma.customerNote.findMany({
      where: { tenantId: session.user.tenantId, customerId: customer.id },
      select: { id: true, content: true, createdAt: true, user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
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
  })
}
