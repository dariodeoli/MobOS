import { prisma } from '../../../../../lib/prisma'
import { error, json, tenantId } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import type { OrderStatus } from '@prisma/client'

type RouteContext = { params: { id?: string } }
const CANCELADOS: OrderStatus[] = ['CANCELLED']

// Analítica del cliente para su perfil: frecuencia, ticket promedio, productos
// preferidos y compras por mes. Se calcula sobre las ventas completadas.
export async function GET(request: Request, { params }: RouteContext) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const id = (params.id || '').trim().slice(0, 128)
  if (!id) return error('Cliente obligatorio.')
  const customer = await prisma.customer.findFirst({ where: { id, tenantId: tenant }, select: { id: true } })
  if (!customer) return error('Cliente no encontrado.', 404)

  const orders = await prisma.order.findMany({
    where: { tenantId: tenant, customerId: customer.id, status: { notIn: CANCELADOS } },
    include: { items: { select: { description: true, quantity: true, totalPyg: true } } },
    orderBy: { createdAt: 'asc' },
  })

  let totalPyg = 0
  const porMes = new Map<string, { month: string; count: number; totalPyg: number }>()
  const porProducto = new Map<string, { description: string; quantity: number; totalPyg: number }>()
  for (const order of orders) {
    const total = Number(order.totalPyg || 0)
    totalPyg += total
    const mes = order.createdAt.toISOString().slice(0, 7)
    const acumuladoMes = porMes.get(mes) || { month: mes, count: 0, totalPyg: 0 }
    acumuladoMes.count += 1; acumuladoMes.totalPyg += total
    porMes.set(mes, acumuladoMes)
    for (const item of order.items) {
      const clave = (item.description || '').trim().slice(0, 120)
      if (!clave) continue
      const acumuladoProducto = porProducto.get(clave) || { description: clave, quantity: 0, totalPyg: 0 }
      acumuladoProducto.quantity += Number(item.quantity || 0); acumuladoProducto.totalPyg += Number(item.totalPyg || 0)
      porProducto.set(clave, acumuladoProducto)
    }
  }

  const count = orders.length
  const primera = orders[0]?.createdAt || null
  const ultima = orders[count - 1]?.createdAt || null
  const dias = primera && ultima ? Math.max(1, Math.round((ultima.getTime() - primera.getTime()) / 86400000)) : 0
  return json({
    ordersCount: count,
    totalPyg,
    avgTicketPyg: count ? Math.round(totalPyg / count) : 0,
    firstPurchaseAt: primera,
    lastPurchaseAt: ultima,
    purchasesPerMonth: dias ? Number((count / (dias / 30)).toFixed(2)) : 0,
    byMonth: [...porMes.values()].slice(-12),
    topProducts: [...porProducto.values()].sort((a, b) => b.totalPyg - a.totalPyg).slice(0, 8),
    statement: orders.slice().reverse().map(order => ({ orderNumber: order.orderNumber || order.id.slice(-6).toUpperCase(), createdAt: order.createdAt, totalPyg: Number(order.totalPyg || 0), status: order.status })),
  })
}
