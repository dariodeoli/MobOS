import { Prisma } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { canAccessAny, requireSession } from '../../../lib/auth'
import { AUTHORIZATION_RESOLVERS } from '../../../lib/authorizations'
import { mencionadosEn, variantesDeNombre } from '../../../lib/menciones'

// Centro de notificaciones del panel: lista corta y accionable, sin tabla
// propia. Se arma con lo que ya existe (pedidos, autorizaciones y comentarios
// internos) y cada rol recibe lo suyo, con el mismo alcance que los módulos.
const DIAS = 7
const MAX = 60
const UNA_HORA_MS = 60 * 60 * 1000

const ETIQUETA_KIND: Record<string, string> = {
  WHOLESALE: 'Precio mayorista',
  CREDIT: 'Crédito del cliente',
  CREDIT_DAYS: 'Días de crédito',
  DISCOUNT: 'Descuento',
  BELOW_LIST_PRICE: 'Venta bajo lista',
  STOCK_ADJUST: 'Ajuste de stock',
  ORDER_VOID: 'Anulación de pedido',
  ORDER_DELIVER_UNPAID: 'Entrega sin cobrar',
  EXPENSE_OVER_LIMIT: 'Gasto sobre el límite',
  TRANSFER: 'Transferencia entre sucursales',
  PURCHASE_CREDIT: 'Compra a crédito',
}

// Estados del taller en lenguaje de pantalla (#148 §14: "tareas").
const ETIQUETA_ESTADO_SERVICIO: Record<string, string> = {
  RECIBIDO: 'Recibido',
  DIAGNOSTICO: 'En diagnóstico',
  CON_TECNICO: 'Con técnico',
  ESPERANDO_REPUESTO: 'Esperando repuesto',
  REPARADO: 'Reparado',
  LISTO: 'Listo para entregar',
}

const gs = (valor: unknown) => `Gs. ${Number(valor || 0).toLocaleString('es-PY')}`
const recorte = (texto: string, largo = 70) => {
  const limpio = String(texto || '').replace(/\s+/g, ' ').trim()
  return limpio.length > largo ? `${limpio.slice(0, largo - 1)}…` : limpio
}

type Notificacion = {
  id: string
  kind: string
  title: string
  detail: string
  at: Date
  href: string
}

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida o expirada.', 401)
  const user = session.user
  const params = new URL(request.url).searchParams
  const limite = Math.min(MAX, Math.max(1, Number(params.get('limit')) || 40))
  const desde = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000)
  const reciente = Date.now() - UNA_HORA_MS * 24
  const items: Notificacion[] = []

  // Pedidos: una sola novedad por pedido, con la acción más urgente.
  if (['ADMIN', 'GERENTE', 'VENDEDOR', 'CAJERA', 'REPARTIDOR'].includes(user.role)) {
    const where: Prisma.OrderWhereInput = {
      tenantId: user.tenantId,
      createdAt: { gte: desde },
      ...(user.role === 'ADMIN'
        ? {}
        : user.role === 'GERENTE'
          ? user.branchId ? { branchId: user.branchId } : {}
          : user.role === 'REPARTIDOR'
            ? { assignedToId: user.id }
            : { sellerId: user.id }),
    }
    const pedidos = await prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, orderNumber: true, status: true, fulfillmentStatus: true, totalPyg: true, createdAt: true, customer: { select: { name: true } } },
    })
    for (const pedido of pedidos) {
      const codigo = pedido.orderNumber || pedido.id
      const cliente = pedido.customer?.name || 'Consumidor final'
      const comun = `${codigo} · ${cliente} · ${gs(pedido.totalPyg)}`
      if (pedido.fulfillmentStatus !== 'DELIVERED') {
        // Para el repartidor el pedido está "asignado" (#148 §14); el resto ve la entrega.
        const asignado = user.role === 'REPARTIDOR'
        items.push({ id: `${asignado ? 'asignado' : 'entrega'}-${pedido.id}`, kind: asignado ? 'ASIGNADO' : 'ENTREGA', title: asignado ? 'Pedido asignado' : 'Entrega pendiente', detail: comun, at: pedido.createdAt, href: `/pedidos/${pedido.id}` })
      } else if (pedido.status === 'PENDING') {
        items.push({ id: `cobro-${pedido.id}`, kind: 'COBRO', title: 'Pedido sin cobrar', detail: comun, at: pedido.createdAt, href: `/pedidos/${pedido.id}` })
      } else if (pedido.createdAt.getTime() >= reciente) {
        items.push({ id: `pedido-${pedido.id}`, kind: 'PEDIDO', title: 'Pedido nuevo', detail: comun, at: pedido.createdAt, href: `/pedidos/${pedido.id}` })
      }
    }
  }

  // Tareas del taller (#148 §14): lo asignado a la persona y, para jefaturas,
  // las órdenes abiertas sin técnico para asignar.
  if (canAccessAny(user, ['service:manage'])) {
    const jefatura = user.role === 'ADMIN' || user.role === 'GERENTE'
    const tareas = await prisma.serviceOrder.findMany({
      where: {
        tenantId: user.tenantId,
        status: { notIn: ['ENTREGADO', 'CANCELADO'] },
        updatedAt: { gte: desde },
        ...(jefatura ? { technicianId: null } : { technicianId: user.id }),
      },
      orderBy: { updatedAt: 'desc' },
      take: 15,
      select: { id: true, serviceNumber: true, device: true, status: true, technicianId: true, technicianName: true, updatedAt: true },
    })
    for (const orden of tareas) {
      const estado = ETIQUETA_ESTADO_SERVICIO[orden.status] || orden.status
      items.push({
        id: `tarea-${orden.id}`,
        kind: 'TAREA',
        title: orden.technicianId ? 'Tarea de taller asignada' : 'Orden de taller sin asignar',
        detail: `${orden.serviceNumber || 'OS'} · ${recorte(orden.device, 40)} · ${estado}`,
        at: orden.updatedAt,
        href: '/servicio',
      })
    }
  }

  // Autorizaciones: pendientes para quien resuelve, resueltas para quien pidió.
  const resuelve = (AUTHORIZATION_RESOLVERS as readonly string[]).includes(user.role)
  const autorizaciones = await prisma.customerAuthorization.findMany({
    where: {
      tenantId: user.tenantId,
      createdAt: { gte: desde },
      ...(resuelve ? { status: 'PENDING' } : { requestedById: user.id, status: { in: ['APPROVED', 'REJECTED'] } }),
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { id: true, kind: true, status: true, createdAt: true, resolvedAt: true, requestedBy: { select: { name: true } }, customer: { select: { name: true } } },
  })
  for (const autorizacion of autorizaciones) {
    const etiqueta = ETIQUETA_KIND[autorizacion.kind] || autorizacion.kind
    const quien = autorizacion.requestedBy?.name || 'Equipo'
    const cliente = autorizacion.customer?.name ? ` · ${autorizacion.customer.name}` : ''
    if (autorizacion.status === 'PENDING') {
      items.push({ id: `autorizacion-${autorizacion.id}`, kind: 'APROBACION', title: 'Aprobación pendiente', detail: `${etiqueta} · ${quien}${cliente}`, at: autorizacion.createdAt, href: '/autorizaciones' })
    } else {
      const aprobada = autorizacion.status === 'APPROVED'
      items.push({ id: `autorizacion-${autorizacion.id}`, kind: aprobada ? 'APROBADA' : 'RECHAZADA', title: aprobada ? 'Solicitud aprobada' : 'Solicitud rechazada', detail: `${etiqueta} · ${quien}${cliente}`, at: autorizacion.resolvedAt || autorizacion.createdAt, href: '/autorizaciones' })
    }
  }

  // Comentarios internos: menciones (@nombre, misma regla que la UI) y
  // comentarios de otros en mis pedidos.
  const variantesPropias = variantesDeNombre(user.name)
  const comentarios = await prisma.orderComment.findMany({
    where: { tenantId: user.tenantId, createdAt: { gte: desde }, userId: { not: user.id } },
    orderBy: { createdAt: 'desc' },
    take: 40,
    select: { id: true, body: true, createdAt: true, orderId: true, order: { select: { orderNumber: true, sellerId: true } }, user: { select: { name: true } } },
  })
  for (const comentario of comentarios) {
    const mencion = mencionadosEn(comentario.body, variantesPropias).length > 0
    const enMiPedido = comentario.order.sellerId === user.id
    if (!mencion && !enMiPedido) continue
    items.push({
      id: `comentario-${comentario.id}`,
      kind: mencion ? 'MENCION' : 'COMENTARIO',
      title: mencion ? 'Te mencionaron en un pedido' : 'Comentario en tu pedido',
      detail: `${comentario.user?.name || 'Equipo'} · ${comentario.order.orderNumber || comentario.orderId}: ${recorte(comentario.body)}`,
      at: comentario.createdAt,
      href: `/pedidos/${comentario.orderId}`,
    })
  }

  items.sort((a, b) => b.at.getTime() - a.at.getTime())
  return json({ items: items.slice(0, limite).map(item => ({ ...item, at: item.at.toISOString() })), windowDays: DIAS }, { headers: { 'Cache-Control': 'no-store' } })
}
