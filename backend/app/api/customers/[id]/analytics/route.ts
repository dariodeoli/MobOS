import { prisma } from '../../../../../lib/prisma'
import { error, json, tenantId } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import type { OrderStatus } from '@prisma/client'

type RouteContext = { params: { id?: string } }
const CANCELADOS: OrderStatus[] = ['CANCELLED']
const TZ = 'America/Asuncion'

const etiquetaMes = (mes: string) => {
  const [anio, numero] = mes.split('-').map(Number)
  if (!anio || !numero) return mes
  return new Date(Date.UTC(anio, numero - 1, 1)).toLocaleDateString('es-PY', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}
const diaSemana = (fecha: Date) => fecha.toLocaleDateString('es-PY', { weekday: 'long', timeZone: TZ })
const capitalizar = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1)

// Analítica del cliente para su perfil: frecuencia, ticket promedio, gasto
// mensual, antigüedad, productos/modelo/categoría preferidos y meses y días de
// mayor actividad. Se calcula sobre las ventas no canceladas.
export async function GET(request: Request, { params }: RouteContext) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const id = (params.id || '').trim().slice(0, 128)
  if (!id) return error('Cliente obligatorio.')
  const customer = await prisma.customer.findFirst({ where: { id, tenantId: tenant }, select: { id: true, createdAt: true } })
  if (!customer) return error('Cliente no encontrado.', 404)

  const orders = await prisma.order.findMany({
    where: { tenantId: tenant, customerId: customer.id, status: { notIn: CANCELADOS } },
    include: {
      items: {
        select: {
          description: true, quantity: true, totalPyg: true,
          product: { select: { name: true, model: true, category: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  let totalPyg = 0
  const porMes = new Map<string, { month: string; label: string; count: number; totalPyg: number }>()
  const porProducto = new Map<string, { description: string; quantity: number; totalPyg: number }>()
  const porModelo = new Map<string, { model: string; quantity: number; totalPyg: number }>()
  const porCategoria = new Map<string, { category: string; quantity: number; totalPyg: number }>()
  const porDia = new Map<string, { day: string; count: number; totalPyg: number }>()
  let sumaIntervalos = 0
  let intervalos = 0
  let anterior: Date | null = null
  for (const order of orders) {
    const total = Number(order.totalPyg || 0)
    totalPyg += total
    if (anterior) { sumaIntervalos += Math.max(0, (order.createdAt.getTime() - anterior.getTime()) / 86400000); intervalos += 1 }
    anterior = order.createdAt
    const mes = order.createdAt.toLocaleDateString('en-CA', { timeZone: TZ }).slice(0, 7)
    const acumuladoMes = porMes.get(mes) || { month: mes, label: etiquetaMes(mes), count: 0, totalPyg: 0 }
    acumuladoMes.count += 1; acumuladoMes.totalPyg += total
    porMes.set(mes, acumuladoMes)
    const dia = capitalizar(diaSemana(order.createdAt))
    const acumuladoDia = porDia.get(dia) || { day: dia, count: 0, totalPyg: 0 }
    acumuladoDia.count += 1; acumuladoDia.totalPyg += total
    porDia.set(dia, acumuladoDia)
    for (const item of order.items) {
      const cantidad = Number(item.quantity || 0)
      const lineaTotal = Number(item.totalPyg || 0)
      const clave = (item.description || '').trim().slice(0, 120)
      if (clave) {
        const acumuladoProducto = porProducto.get(clave) || { description: clave, quantity: 0, totalPyg: 0 }
        acumuladoProducto.quantity += cantidad; acumuladoProducto.totalPyg += lineaTotal
        porProducto.set(clave, acumuladoProducto)
      }
      const modelo = (item.product?.model || '').trim()
      if (modelo) {
        const acumuladoModelo = porModelo.get(modelo) || { model: modelo, quantity: 0, totalPyg: 0 }
        acumuladoModelo.quantity += cantidad; acumuladoModelo.totalPyg += lineaTotal
        porModelo.set(modelo, acumuladoModelo)
      }
      const categoria = (item.product?.category || '').trim()
      if (categoria) {
        const acumuladoCategoria = porCategoria.get(categoria) || { category: categoria, quantity: 0, totalPyg: 0 }
        acumuladoCategoria.quantity += cantidad; acumuladoCategoria.totalPyg += lineaTotal
        porCategoria.set(categoria, acumuladoCategoria)
      }
    }
  }

  const count = orders.length
  const primera = orders[0]?.createdAt || null
  const ultima = orders[count - 1]?.createdAt || null
  const diasComprando = primera && ultima ? Math.max(1, Math.round((ultima.getTime() - primera.getTime()) / 86400000)) : 0
  const mesesActivos = primera ? Math.max(1, (Date.now() - primera.getTime()) / (30 * 86400000)) : 1
  const antiguedadDias = Math.max(0, Math.round((Date.now() - customer.createdAt.getTime()) / 86400000))
  return json({
    ordersCount: count,
    totalPyg,
    avgTicketPyg: count ? Math.round(totalPyg / count) : 0,
    firstPurchaseAt: primera,
    lastPurchaseAt: ultima,
    purchasesPerMonth: diasComprando ? Number((count / (diasComprando / 30)).toFixed(2)) : 0,
    spendPerMonthPyg: Math.round(totalPyg / mesesActivos),
    frequencyDays: intervalos ? Math.round(sumaIntervalos / intervalos) : null,
    customerSince: customer.createdAt,
    antiguedadDias,
    byMonth: [...porMes.values()].slice(-12),
    topProducts: [...porProducto.values()].sort((a, b) => b.totalPyg - a.totalPyg).slice(0, 8),
    topModels: [...porModelo.values()].sort((a, b) => b.totalPyg - a.totalPyg).slice(0, 5),
    topCategories: [...porCategoria.values()].sort((a, b) => b.totalPyg - a.totalPyg).slice(0, 5),
    topMonths: [...porMes.values()].sort((a, b) => b.totalPyg - a.totalPyg).slice(0, 3),
    topWeekdays: [...porDia.values()].sort((a, b) => b.count - a.count || b.totalPyg - a.totalPyg).slice(0, 3),
    statement: orders.slice().reverse().map(order => ({ orderNumber: order.orderNumber || order.id.slice(-6).toUpperCase(), createdAt: order.createdAt, totalPyg: Number(order.totalPyg || 0), status: order.status })),
  })
}
