import { prisma } from '../../../../lib/prisma'
import { serialKey } from '../../../../lib/validation'
import { error, json } from '../../../../lib/http'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { buscarPorTokenPublico } from '../../../../lib/public-token'
import { etiquetaServicio } from '../../../../lib/service-order'
import { etiquetaPago } from '../../../../lib/payments'
import { seguimientoDeEntrega } from '../../../../lib/orders'

// Resumen de cuenta público del cliente. El token es aleatorio y no
// enumerable, y el nivel acota lo que se muestra:
// - rapido: empresa, nombre, saldo pendiente total, vencimientos y últimos 10
//   pedidos (número, fecha, total, estado de pago/entrega).
// - completo: además garantías activas, direcciones del cliente y el enlace al
//   comprobante de cada pedido (solo si tiene token público).
// Nunca expone costos, márgenes, notas internas, teléfonos, datos de otros
// clientes ni información de contacto de terceros.
const text = (value: unknown, max = 200) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : '')

// Resolución por hash (#172/#178) con fallback a enlaces legacy en claro; al
// primer uso de un enlace legacy se le guarda el hash sin romper el QR.
async function buscarPortal(token: string) {
  if (!token || token.length > 200) return null
  const select = {
    id: true,
    level: true,
    tenantId: true,
    customerId: true,
    customer: { select: { name: true, publicNote: true, loyaltyPointsPyg: true } },
    tenant: { select: { name: true, logos: { select: { id: true }, take: 1 } } },
  } as const
  const { row, hash, legacy } = await buscarPorTokenPublico(
    token,
    (tokenHash) => prisma.customerPortalToken.findFirst({ where: { tokenHash, revokedAt: null }, select }),
    (legacyToken) => prisma.customerPortalToken.findFirst({ where: { token: legacyToken, revokedAt: null }, select }),
  )
  if (row && legacy && hash) {
    await prisma.customerPortalToken.updateMany({ where: { id: row.id, tokenHash: null }, data: { tokenHash: hash } }).catch(() => {})
  }
  return row
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const limited = enforceRateLimit(request, 'customer-portal', 30, 60_000)
  if (limited) return limited

  const { token } = await context.params
  const portal = await buscarPortal(text(token))
  if (!portal) return error('Cuenta no encontrada.', 404)

  const completo = portal.level === 'completo'
  const now = Date.now()

  // Informes de dispositivo (#240 ítem 3): seriales de los equipos comprados
  // por el cliente para enlazar el informe público desde su cuenta.
  const informes = await prisma.orderItemSerial.findMany({
    where: { orderItem: { order: { tenantId: portal.tenantId, customerId: portal.customerId, archivedAt: null } } },
    orderBy: { orderItem: { order: { createdAt: 'desc' } } },
    take: 12,
    select: { serial: true, orderItem: { select: { description: true, order: { select: { orderNumber: true } } } } },
  })

  // Servicio técnico (#240 §4 → cliente): el dueño del equipo ve en qué etapa
  // está su reparación. Solo estado y fechas: nunca costos, notas internas,
  // técnico ni el secreto de desbloqueo.
  const servicios = await prisma.serviceOrder.findMany({
    where: { tenantId: portal.tenantId, customerId: portal.customerId },
    select: { serviceNumber: true, device: true, serviceName: true, serial: true, status: true, receivedAt: true, deliveredAt: true },
    orderBy: { receivedAt: 'desc' },
    take: 10,
  })

  // Mensajes de la tienda al cliente (#240 → portal): los activos (sin vencer),
  // con el visto marcado al abrir la cuenta: `nuevo` es el primer render.
  const mensajes = await prisma.customerNotice.findMany({
    where: { tenantId: portal.tenantId, customerId: portal.customerId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    select: { id: true, content: true, createdAt: true, firstViewedAt: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })
  if (mensajes.length) {
    const ahora = new Date()
    const ids = mensajes.map((mensaje) => mensaje.id)
    await prisma.customerNotice.updateMany({ where: { id: { in: ids } }, data: { lastViewedAt: ahora } })
    await prisma.customerNotice.updateMany({ where: { id: { in: ids }, firstViewedAt: null }, data: { firstViewedAt: ahora } })
  }

  // Reservas (#240 → portal): los equipos guardados a nombre del cliente, con
  // su vencimiento (si no los retira, se liberan solos).
  const reservas = await prisma.inventoryUnit.findMany({
    where: { tenantId: portal.tenantId, reservationCustomerId: portal.customerId, status: 'RESERVED' },
    select: { serial: true, reservedUntil: true, product: { select: { name: true, capacity: true } }, branch: { select: { name: true } } },
    orderBy: { reservedUntil: 'asc' },
    take: 5,
  })

  // Pagos (#240 → portal): lo que el cliente ya pagó, con su medio y fecha, y
  // el total confirmado de toda su historia.
  const pagos = await prisma.payment.findMany({
    where: { tenantId: portal.tenantId, status: 'CONFIRMED', order: { customerId: portal.customerId, archivedAt: null } },
    select: { amountPyg: true, method: true, paidAt: true, order: { select: { orderNumber: true } } },
    orderBy: { paidAt: 'desc' },
    take: 8,
  })
  const totalPagado = await prisma.payment.aggregate({
    where: { tenantId: portal.tenantId, status: 'CONFIRMED', order: { customerId: portal.customerId, archivedAt: null } },
    _sum: { amountPyg: true },
  })

  // Cotizaciones (#240 → portal): las propuestas que la tienda ya compartió,
  // con su validez y el enlace público para aceptarlas. El borrador (DRAFT) es
  // interno y nunca viaja; sin token público no hay nada que abrir.
  const cotizaciones = await prisma.quote.findMany({
    where: {
      tenantId: portal.tenantId,
      customerId: portal.customerId,
      status: { not: 'DRAFT' },
      publicToken: { not: null },
    },
    select: { number: true, status: true, totalPyg: true, createdAt: true, validUntil: true, publicToken: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  const [orders, saldo, dueOrders, warrantyRows, saldoFavor] = await Promise.all([
    prisma.order.findMany({
      where: { tenantId: portal.tenantId, customerId: portal.customerId, archivedAt: null },
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        totalPyg: true,
        status: true,
        fulfillmentStatus: true,
        deliveryType: true,
        updatedAt: true,
        dueAt: true,
        publicToken: true,
        // #178: los pedidos nuevos ya no guardan su token histórico en claro;
        // el enlace del comprobante sale del enlace vigente de nivel rápido.
        accessTokens: { where: { revokedAt: null, level: 'rapido' }, orderBy: { createdAt: 'desc' }, take: 1, select: { token: true } },
        payments: { where: { status: 'CONFIRMED' }, select: { amountPyg: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.$queryRaw<Array<{ pending: bigint }>>`
      SELECT COALESCE(SUM(GREATEST(0, o."totalPyg" - COALESCE(p.confirmed, 0))), 0)::bigint AS pending
      FROM "Order" o
      LEFT JOIN (SELECT "orderId", SUM("amountPyg") AS confirmed FROM "Payment" WHERE "tenantId" = ${portal.tenantId} AND status = 'CONFIRMED' GROUP BY "orderId") p ON p."orderId" = o."id"
      WHERE o."tenantId" = ${portal.tenantId} AND o."customerId" = ${portal.customerId} AND o."status" <> 'CANCELLED'`,
    prisma.order.findMany({
      where: { tenantId: portal.tenantId, customerId: portal.customerId, status: { not: 'CANCELLED' }, dueAt: { not: null } },
      select: { orderNumber: true, dueAt: true, totalPyg: true, payments: { where: { status: 'CONFIRMED' }, select: { amountPyg: true } } },
      orderBy: { dueAt: 'asc' },
      take: 50,
    }),
    completo
      ? prisma.warrantyCase.findMany({
          where: { tenantId: portal.tenantId, customerId: portal.customerId, status: { not: 'DELIVERED' } },
          select: { serial: true, description: true, status: true, expiresAt: true, warrantyDays: true, publicToken: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        })
      : Promise.resolve([]),
    // Beneficios (#240 → portal): saldo a favor (crédito de tienda) para que el
    // cliente sepa que lo tiene; los puntos vienen del cliente.
    prisma.storeCredit.aggregate({
      where: { tenantId: portal.tenantId, customerId: portal.customerId, remainingPyg: { gt: 0 } },
      _sum: { remainingPyg: true },
    }),
  ])

  // Seguimiento de la entrega (#240 → portal): los pasos del método con sus
  // fechas, con el mismo armado que la página pública del pedido. Viaja en los
  // dos niveles: es el estado de la entrega, no un comprobante ni datos internos.
  const eventosEntrega = orders.length
    ? await prisma.auditLog.findMany({
        where: { tenantId: portal.tenantId, entity: 'Order', entityId: { in: orders.map((order) => order.id) }, action: 'ORDER_FULFILLMENT_UPDATED' },
        orderBy: { createdAt: 'asc' },
        select: { entityId: true, createdAt: true, metadata: true },
      })
    : []
  const fechasPorPedido = new Map<string, Record<string, string>>()
  for (const evento of eventosEntrega) {
    const actual = (evento.metadata as { current?: unknown } | null)?.current
    if (typeof actual !== 'string' || !evento.entityId) continue
    const fechas = fechasPorPedido.get(evento.entityId) || {}
    if (!fechas[actual]) fechas[actual] = evento.createdAt.toISOString()
    fechasPorPedido.set(evento.entityId, fechas)
  }

  const pendienteDe = (totalPyg: number, pagos: Array<{ amountPyg: number }>) =>
    Math.max(0, Number(totalPyg) - pagos.reduce((sum, pago) => sum + Number(pago.amountPyg || 0), 0))
  const vencimientos = dueOrders
    .map(order => ({
      orderNumber: order.orderNumber,
      dueAt: order.dueAt,
      pendingPyg: pendienteDe(order.totalPyg, order.payments),
    }))
    .filter(order => order.pendingPyg > 0)

  const payload: Record<string, unknown> = {
    level: portal.level,
    company: { name: portal.tenant?.name || null, logo: Boolean(portal.tenant?.logos?.length) },
    customer: {
      name: portal.customer?.name || null,
      // Nota pública de la tienda (issue #127): solo viaja si existe; la nota
      // interna sigue prohibida en el portal.
      ...(portal.customer?.publicNote ? { publicNote: portal.customer.publicNote } : {}),
    },
    balancePyg: Number(saldo[0]?.pending || 0n),
    // Tus beneficios (#240 → portal): saldo a favor (1 punto = 1 Gs. canjeable).
    saldoFavorPyg: Number(saldoFavor._sum.remainingPyg || 0),
    puntosPyg: Number(portal.customer?.loyaltyPointsPyg || 0),
    dueDates: vencimientos,
    informes: informes.map((fila) => ({ serial: fila.serial, model: fila.orderItem.description, orderNumber: fila.orderItem.order.orderNumber })),
    servicios: servicios.map((orden) => ({
      serviceNumber: orden.serviceNumber,
      device: orden.device,
      serviceName: orden.serviceName,
      serial: orden.serial,
      status: orden.status,
      statusLabel: etiquetaServicio(orden.status),
      receivedAt: orden.receivedAt,
      deliveredAt: orden.deliveredAt,
    })),
    // Mensajes de la tienda: contenido y fecha; `nuevo` en el primer render.
    mensajes: mensajes.map(({ content, createdAt, firstViewedAt }) => ({ content, createdAt, nuevo: !firstViewedAt })),
    // Reservas: equipo, sucursal y hasta cuándo está guardado.
    reservas: reservas.map(({ serial, reservedUntil, product, branch }) => ({
      serial,
      model: product?.name || 'Equipo',
      capacity: product?.capacity || null,
      branch: branch?.name || null,
      reservedUntil,
    })),
    // Pagos: últimos 8 con su medio y el total confirmado de la historia.
    pagos: pagos.map(({ order, ...pago }) => ({
      amountPyg: pago.amountPyg,
      methodLabel: etiquetaPago(pago.method),
      paidAt: pago.paidAt,
      orderNumber: order.orderNumber,
    })),
    totalPagadoPyg: Number(totalPagado._sum.amountPyg || 0),
    // Cotizaciones: número, monto, validez y enlace público; la más nueva primero.
    cotizaciones,
    orders: orders.map(order => {
      // #178: el pedido nuevo no guarda su token histórico en claro; el enlace
      // del comprobante sale del enlace vigente de nivel rápido (o del legacy).
      const receiptToken = order.publicToken || order.accessTokens[0]?.token
      // Fechas por paso: las actualizaciones de entrega (#191) y, si falta la
      // del estado actual, la última modificación del pedido.
      const fechas = { ...(fechasPorPedido.get(order.id) || {}) }
      if (!fechas[order.fulfillmentStatus]) fechas[order.fulfillmentStatus] = order.updatedAt.toISOString()
      return {
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        totalPyg: order.totalPyg,
        status: order.status,
        fulfillmentStatus: order.fulfillmentStatus,
        tracking: seguimientoDeEntrega(order.deliveryType, order.fulfillmentStatus, fechas),
        pendingPyg: pendienteDe(order.totalPyg, order.payments),
        dueAt: order.dueAt,
        ...(completo && receiptToken ? { receiptToken } : {}),
      }
    }),
  }

  if (completo) {
    const addresses = await prisma.customerAddress.findMany({
      where: { customerId: portal.customerId },
      select: { label: true, address: true, city: true, department: true, country: true, isDefault: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      take: 20,
    })
    // Si el caso está en el taller, la garantía muestra el estado del servicio
    // que nació de ella (#224: la conversión comparte el serial).
    // #240: el serial puede venir con guiones en la garantía y normalizado en la
    // orden del taller: se compara por la clave normalizada.
    const servicioPorSerial = new Map(servicios.map((orden) => [serialKey(orden.serial), orden]))
    payload.warranties = warrantyRows.map(warranty => {
      const servicio = servicioPorSerial.get(serialKey(warranty.serial))
      const enTaller = servicio && !['ENTREGADO', 'CANCELADO'].includes(servicio.status) ? servicio : null
      return {
        serial: warranty.serial,
        description: warranty.description,
        status: warranty.status,
        warrantyDays: warranty.warrantyDays,
        expiresAt: warranty.expiresAt,
        daysRemaining: warranty.expiresAt ? Math.max(0, Math.ceil((new Date(warranty.expiresAt).getTime() - now) / 86400000)) : null,
        // Credencial pública (#240 §3 → portal): el cliente abre su garantía con
        // cobertura y vencimiento desde su cuenta (mismo token del QR).
        ...(warranty.publicToken ? { publicToken: warranty.publicToken } : {}),
        ...(enTaller ? { taller: { status: enTaller.status, statusLabel: etiquetaServicio(enTaller.status) } } : {}),
      }
    })
    payload.addresses = addresses.map(address => ({
      label: address.label,
      address: address.address,
      city: address.city,
      department: address.department,
      country: address.country,
      isDefault: address.isDefault,
    }))
  }

  return json(payload)
}
