import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { detalleAperturaInforme, serialEnmascarado } from '../../../../../lib/device-report'
import { etiquetaServicio } from '../../../../../lib/service-order'
import { COUNTABLE_PAYMENT_WHERE } from '../../../../../lib/payment-net'
import { displayOrderNumber } from '../../../../../lib/order-number'
import { fechaParametro, filtrarEventos, grupoEvento, gruposValidos, resumenCompras } from '../../../../../lib/customer-history'

type RouteContext = { params: Promise<{ id: string }> }

const ESTADO_PEDIDO: Record<string, string> = { PENDING: 'Pendiente', REGISTERED: 'Registrado', COMPLETED: 'Completado', CANCELLED: 'Cancelado' }
const ENTREGA_PEDIDO: Record<string, string> = { PROCESSING: 'Preparando', IN_TRANSIT: 'En camino', READY_TO_SHIP: 'Listo para enviar', READY_FOR_PICKUP: 'Listo para retirar', DELIVERED: 'Entregado' }
const ESTADO_GARANTIA: Record<string, string> = { RECEIVED: 'Recibida', DIAGNOSIS: 'En diagnóstico', READY: 'Lista', DELIVERED: 'Entregada' }
const TIPO_SEGUIMIENTO: Record<string, string> = { CALL: 'Llamada', WHATSAPP: 'WhatsApp', VISIT: 'Visita', OTHER: 'Seguimiento' }
const TIPO_AUTORIZACION: Record<string, string> = { WHOLESALE: 'Mayorista', CREDIT: 'Crédito', CREDIT_DAYS: 'Días de crédito', DISCOUNT: 'Descuento' }
const CAMPOS_ES: Record<string, string> = {
  name: 'Nombre', firstName: 'Primer nombre', secondName: 'Segundo nombre',
  document: 'Documento', phone: 'Teléfono', countryCode: 'Código de país', email: 'Correo',
  notes: 'Nota interna', publicNote: 'Nota pública', tags: 'Etiquetas', pricingTier: 'Tipo de cliente',
  creditLimitPyg: 'Límite de crédito', creditDays: 'Días de crédito', priceListId: 'Lista de precios',
  insuranceEnabled: 'Seguro del cliente', insuranceRatePct: 'Porcentaje de seguro',
  billingName: 'Razón social', billingDocument: 'RUC', addresses: 'Direcciones', taxExempt: 'Exento de impuestos',
}
// Acciones de auditoría con nombre legible; las de notas quedan afuera porque
// los comentarios ya generan su propio evento (evita duplicar).
const ACCION_AUDITORIA: Record<string, string> = {
  CUSTOMER_CREATED: 'Cliente creado',
  CUSTOMER_UPDATED: 'Datos del cliente actualizados',
  CUSTOMER_BILLING_UPDATED: 'Facturación actualizada',
  CUSTOMER_BILLING_IDENTITY_CREATED: 'Titular de facturación agregado',
  CUSTOMER_BILLING_IDENTITY_UPDATED: 'Titular de facturación editado',
  CUSTOMER_BILLING_IDENTITY_DELETED: 'Titular de facturación eliminado',
  CUSTOMER_AUTHORIZATION_REQUESTED: 'Solicitud comercial registrada',
  CUSTOMER_AUTHORIZATION_APPROVED: 'Solicitud comercial aprobada',
  CUSTOMER_AUTHORIZATION_REJECTED: 'Solicitud comercial rechazada',
  CUSTOMER_DEVICE_REPORT_SHARED: 'Informe del equipo compartido',
  QUOTE_EMAIL_SENT: 'Cotización enviada por correo',
  CUSTOMER_QUOTE_SHARED: 'Cotización enviada',
  CUSTOMER_MERGED: 'Cliente unificado',
  CUSTOMER_MERGED_INTO: 'Ficha unificada con otra',
  CUSTOMER_DEVICE_REPORT_VIEWED: 'Informe del equipo visto por el cliente',
  SERVICE_ORDER_CREATED: 'Equipo en taller',
  SERVICE_ORDER_FROM_WARRANTY: 'Equipo en taller (garantía)',
  SERVICE_ORDER_STATUS: 'Estado del taller',
}
// Acciones del taller que se dibujan con el ícono de servicio en la ficha.
const ACCIONES_SERVICIO = new Set(['SERVICE_ORDER_CREATED', 'SERVICE_ORDER_FROM_WARRANTY', 'SERVICE_ORDER_STATUS'])
const AUDITORIAS_EXCLUIDAS = /^CUSTOMER_(NOTE|NOTICE)_/

const formatoGs = (value: unknown) => `Gs ${Number(value || 0).toLocaleString('es-PY')}`
const resumenValorComercial = (value: unknown) => {
  if (!value || typeof value !== 'object') return ''
  const data = value as Record<string, unknown>
  const partes: string[] = []
  if (data.creditLimitPyg !== undefined && data.creditLimitPyg !== null) partes.push(`límite ${formatoGs(data.creditLimitPyg)}`)
  if (data.creditDays !== undefined && data.creditDays !== null) partes.push(`${data.creditDays} día(s)`)
  if (data.maxDiscountPyg !== undefined && data.maxDiscountPyg !== null) partes.push(`máximo ${formatoGs(data.maxDiscountPyg)}`)
  if (data.discountPyg !== undefined && data.discountPyg !== null) partes.push(`descuento ${formatoGs(data.discountPyg)}`)
  return partes.join(' · ')
}

// Resumen legible de la metadata de auditoría (nunca se devuelve el JSON crudo).
function detalleMetadata(action: string, metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') return ''
  const data = metadata as Record<string, unknown>
  if (action === 'CUSTOMER_AUTHORIZATION_REQUESTED') {
    const tipo = TIPO_AUTORIZACION[String(data.kind)] || String(data.kind || 'Solicitud')
    const valor = resumenValorComercial(data.requestedValue)
    return [tipo, valor ? `Pedido: ${valor}` : '', typeof data.note === 'string' && data.note ? `Nota: ${data.note}` : ''].filter(Boolean).join(' · ')
  }
  if (action === 'CUSTOMER_AUTHORIZATION_APPROVED' || action === 'CUSTOMER_AUTHORIZATION_REJECTED') {
    const tipo = TIPO_AUTORIZACION[String(data.kind)] || String(data.kind || 'Solicitud')
    const autorizado = resumenValorComercial(data.resolvedValue)
    const nota = typeof data.resolvedNote === 'string' && data.resolvedNote ? `Motivo: ${data.resolvedNote}` : ''
    return [tipo, autorizado ? `Autorizado: ${autorizado}` : '', nota].filter(Boolean).join(' · ')
  }
  if (action === 'CUSTOMER_DEVICE_REPORT_VIEWED') return detalleAperturaInforme(data)
  if (action === 'SERVICE_ORDER_CREATED' || action === 'SERVICE_ORDER_FROM_WARRANTY') {
    const equipo = typeof data.device === 'string' ? data.device : ''
    const serial = serialEnmascarado(data.serial)
    return [equipo, serial ? `serial ${serial}` : '', etiquetaServicio(data.status)].filter(Boolean).join(' · ')
  }
  if (action === 'SERVICE_ORDER_STATUS') {
    const equipo = typeof data.device === 'string' ? data.device : ''
    const cambio = `${etiquetaServicio(data.previous)} → ${etiquetaServicio(data.current)}`
    return [equipo, cambio].filter(Boolean).join(' · ')
  }
  if (action === 'CUSTOMER_MERGED') {
    const con = typeof data.duplicado === 'string' ? `con ${data.duplicado}` : 'con el duplicado'
    const resumen = typeof data.resumen === 'string' ? data.resumen : ''
    return [con, resumen].filter(Boolean).join(' · ')
  }
  if (action === 'CUSTOMER_MERGED_INTO') {
    const con = typeof data.principal === 'string' ? `con ${data.principal}` : 'con la ficha principal'
    const resumen = typeof data.resumen === 'string' ? data.resumen : ''
    return [con, resumen].filter(Boolean).join(' · ')
  }
  if (action === 'CUSTOMER_QUOTE_SHARED') {
    const canal = data.canal === 'EMAIL' ? `por correo${typeof data.destino === 'string' && data.destino ? ` a ${data.destino}` : ''}` : 'por WhatsApp'
    const numero = typeof data.quoteNumber === 'string' ? data.quoteNumber : ''
    return [canal, numero].filter(Boolean).join(' · ')
  }
  if (action === 'CUSTOMER_DEVICE_REPORT_SHARED') {
    const canal = data.canal === 'EMAIL' ? `por correo${typeof data.email === 'string' && data.email ? ` a ${data.email}` : ''}` : 'por WhatsApp'
    const serial = typeof data.serial === 'string' ? data.serial : ''
    return [canal, serial ? `serial ${serial.length > 6 ? `${serial.slice(0, 4)}…${serial.slice(-3)}` : serial}` : ''].filter(Boolean).join(' · ')
  }
  const campos = Array.isArray(data.fields) ? data.fields.map((campo) => CAMPOS_ES[String(campo)] || String(campo)) : []
  if (campos.length) return `Campos: ${campos.join(', ')}`
  return Object.entries(data)
    .filter(([clave]) => clave !== 'customerId' && clave !== 'identityId')
    .map(([clave, valor]) => `${CAMPOS_ES[clave] || clave}: ${valor !== null && typeof valor === 'object' ? JSON.stringify(valor) : String(valor)}`)
    .join(' · ')
    .slice(0, 300)
}

type TimelineEvent = {
  id: string
  type: string
  action: string
  label?: string
  createdAt: Date
  user: { id: string; name: string } | null
  detail: string
  // Para abrir el detalle desde la fila (pedido, cotización, equipo…).
  ref?: { kind: string; id: string }
  // Líneas del pedido (producto, cantidad e IMEI) y montos, solo en pedidos.
  items?: { description: string; quantity: number; serials: string[] }[]
  amounts?: { totalPyg: number; paidPyg: number; balancePyg: number; status: string; dueAt: string | null }
}

const ESTADO_COTIZACION: Record<string, string> = { DRAFT: 'Borrador', SENT: 'Enviada', ACCEPTED: 'Aceptada', REJECTED: 'Rechazada', CONVERTED: 'Convertida en pedido', EXPIRED: 'Vencida', CANCELLED: 'Cancelada' }
const ESTADO_TRADEIN: Record<string, string> = { RECEIVED: 'Recibido', REVIEW: 'En revisión', REPAIR: 'En reparación', READY: 'Listo', STOCK: 'En stock', SOLD_EXTERNAL: 'Vendido' }

// Cronología del cliente: alta, pedidos, pagos confirmados, comentarios,
// seguimientos (agendado/hecho), garantías, solicitudes y autorizaciones
// comerciales, cambios de datos y auditoría, más reciente primero.
// Paginada con cursor propio (fecha|id) para el botón "Cargar más".
// Mismo alcance de sucursal que el perfil: VENDEDOR solo si tiene pedidos en
// su sucursal; ADMIN/GERENTE ven todo el tenant.
export async function GET(request: Request, props: RouteContext) {
  const params = await props.params;
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const tenant = session.user.tenantId
  const id = (params.id || '').trim().slice(0, 128)
  if (!id) return error('Cliente obligatorio.')
  const searchParams = new URL(request.url).searchParams
  const limitSolicitado = Number(searchParams.get('limit'))
  // Sin `limit` explícito se conserva el contrato previo (hasta 300 eventos);
  // la ficha pide 20 y pagina con cursor.
  const limit = Number.isFinite(limitSolicitado) && limitSolicitado > 0 ? Math.min(100, Math.floor(limitSolicitado)) : 300
  const cursor = searchParams.get('cursor') || ''
  // Filtros opcionales: grupos (compras, pagos, saldo…) y período (desde/hasta).
  const grupos = gruposValidos(searchParams.get('grupos'))
  const desde = fechaParametro(searchParams.get('desde'))
  const hasta = fechaParametro(searchParams.get('hasta'), true)

  const customer = await prisma.customer.findFirst({
    where: { id, tenantId: tenant },
    select: { id: true, name: true, createdAt: true, createdBy: { select: { id: true, name: true } } },
  })
  if (!customer) return error('Cliente no encontrado.', 404)

  const sellerBranchId = session.user.role === 'VENDEDOR' ? session.user.branchId : null
  const branchId = session.user.role === 'GERENTE' ? null : sellerBranchId

  const [orders, notes, followUps, notices, audits] = await Promise.all([
    prisma.order.findMany({
      where: { tenantId: tenant, customerId: customer.id, ...(branchId ? { branchId } : {}) },
      select: {
        id: true, orderNumber: true, totalPyg: true, status: true, fulfillmentStatus: true, createdAt: true,
        seller: { select: { id: true, name: true } },
        dueAt: true,
        items: { select: { description: true, quantity: true, serials: true } },
        payments: { where: { status: 'CONFIRMED', ...COUNTABLE_PAYMENT_WHERE }, select: { id: true, amountPyg: true, method: true, paidAt: true, createdAt: true, dueAt: true }, orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
    prisma.customerNote.findMany({
      where: { tenantId: tenant, customerId: customer.id },
      select: { id: true, content: true, createdAt: true, user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
    prisma.customerFollowUp.findMany({
      where: { tenantId: tenant, customerId: customer.id },
      select: { id: true, kind: true, note: true, dueAt: true, doneAt: true, createdAt: true, user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
    // Mensajes de la tienda al cliente (#240 → portal): el envío y su visto.
    prisma.customerNotice.findMany({
      where: { tenantId: tenant, customerId: customer.id },
      select: { id: true, content: true, createdAt: true, firstViewedAt: true, user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.auditLog.findMany({
      where: {
        tenantId: tenant,
        NOT: { action: { startsWith: 'CUSTOMER_NOTE_' } },
        OR: [
          { entity: 'Customer', entityId: customer.id },
          { metadata: { path: ['customerId'], equals: customer.id } },
        ],
      },
      select: { id: true, action: true, metadata: true, createdAt: true, user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
  ])
  if (branchId && !orders.length) return error('No autorizado para esa sucursal.', 403)

  const serials = [...new Set(orders.flatMap(order => order.items.flatMap(item => Array.isArray(item.serials) ? item.serials as string[] : [])))]
  const warranties = await prisma.warrantyCase.findMany({
    where: {
      tenantId: tenant,
      ...(branchId ? { branchId } : {}),
      OR: [
        { customerId: customer.id },
        { customerName: customer.name },
        ...(serials.length ? [{ serial: { in: serials } }] : []),
      ],
    },
    select: { id: true, serial: true, description: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const orderIds = orders.map(order => order.id)
  const [quotes, tradeIns, credits, cuotas] = await Promise.all([
    prisma.quote.findMany({
      where: { tenantId: tenant, customerId: customer.id, ...(branchId ? { branchId } : {}) },
      select: { id: true, number: true, totalPyg: true, status: true, validUntil: true, createdAt: true, seller: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    orderIds.length
      ? prisma.tradeInDevice.findMany({
        where: { tenantId: tenant, orderId: { in: orderIds } },
        select: { id: true, model: true, serial: true, valuePyg: true, status: true, createdAt: true, order: { select: { id: true, orderNumber: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      : Promise.resolve([]),
    // Saldo a favor: solo del cliente (no depende de la sucursal del pedido).
    branchId
      ? Promise.resolve([])
      : prisma.storeCredit.findMany({
        where: { tenantId: tenant, customerId: customer.id },
        select: { id: true, amountPyg: true, remainingPyg: true, note: true, createdAt: true, createdById: true, order: { select: { orderNumber: true } }, uses: { select: { id: true, amountPyg: true, createdAt: true, order: { select: { orderNumber: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    // Cuotas del plan de crédito que todavía no se cobraron (con vencimiento).
    orderIds.length
      ? prisma.payment.findMany({
        where: { tenantId: tenant, orderId: { in: orderIds }, status: 'PENDING', dueAt: { not: null } },
        select: { id: true, amountPyg: true, dueAt: true, createdAt: true, order: { select: { orderNumber: true } } },
        orderBy: { dueAt: 'desc' },
        take: 100,
      })
      : Promise.resolve([]),
  ])
  // Correos enviados al cliente: recibos de sus pedidos y cotizaciones.
  const correos = (orderIds.length || quotes.length)
    ? await prisma.emailOutbox.findMany({
      where: {
        tenantId: tenant,
        sentAt: { not: null },
        OR: [
          ...(orderIds.length ? [{ aggregateType: 'Order', aggregateId: { in: orderIds } }] : []),
          ...(quotes.length ? [{ aggregateType: 'Quote', aggregateId: { in: quotes.map(quote => quote.id) } }] : []),
        ],
      },
      select: { id: true, kind: true, aggregateType: true, aggregateId: true, sentAt: true },
      orderBy: { sentAt: 'desc' },
      take: 100,
    })
    : []
  const numeroPedido = new Map(orders.map(order => [order.id, displayOrderNumber(order.orderNumber)]))
  const numeroCotizacion = new Map(quotes.map(quote => [quote.id, quote.number]))

  const events: TimelineEvent[] = [
    {
      id: `customer-${customer.id}`,
      type: 'customer',
      action: 'Cliente creado',
      createdAt: customer.createdAt,
      user: customer.createdBy,
      detail: `Creado por ${customer.createdBy?.name || 'Sistema'}`,
    },
    ...orders.flatMap(order => {
      const pagado = order.payments.reduce((sum, payment) => sum + Number(payment.amountPyg || 0), 0)
      const saldo = Math.max(0, Number(order.totalPyg || 0) - pagado)
      const detalle = [
        `Pedido ${displayOrderNumber(order.orderNumber)} · ${formatoGs(order.totalPyg)} · ${ESTADO_PEDIDO[order.status] || order.status}`,
        ENTREGA_PEDIDO[order.fulfillmentStatus] ? `Entrega: ${ENTREGA_PEDIDO[order.fulfillmentStatus]}` : '',
        saldo > 0 ? `Saldo pendiente ${formatoGs(saldo)}` : '',
      ].filter(Boolean).join(' · ')
      const pedido: TimelineEvent = {
        id: `order-${order.id}`,
        type: 'order',
        action: 'Pedido creado',
        createdAt: order.createdAt,
        user: order.seller,
        detail: detalle,
        ref: { kind: 'order', id: order.id },
        items: order.items.map(item => ({ description: item.description, quantity: item.quantity, serials: Array.isArray(item.serials) ? (item.serials as unknown[]).map(String) : [] })),
        amounts: { totalPyg: Number(order.totalPyg || 0), paidPyg: pagado, balancePyg: saldo, status: ESTADO_PEDIDO[order.status] || order.status, dueAt: order.dueAt ? order.dueAt.toISOString() : null },
      }
      const pagos: TimelineEvent[] = order.payments.map(payment => ({
        id: `payment-${payment.id}`,
        type: 'payment',
        action: 'Pago confirmado',
        createdAt: payment.paidAt || payment.createdAt,
        user: null,
        detail: `Pedido ${displayOrderNumber(order.orderNumber)} · ${formatoGs(payment.amountPyg)} · ${payment.method}${payment.dueAt ? ` · cuota con vencimiento ${payment.dueAt.toLocaleDateString('es-PY')}` : ''}`,
        ref: { kind: 'order', id: order.id },
      }))
      return [pedido, ...pagos]
    }),
    ...quotes.map(quote => ({
      id: `quote-${quote.id}`,
      type: 'quote',
      action: 'Cotización',
      createdAt: quote.createdAt,
      user: quote.seller,
      detail: `${quote.number} · ${formatoGs(quote.totalPyg)} · ${ESTADO_COTIZACION[quote.status] || quote.status}${quote.validUntil ? ` · válida hasta ${quote.validUntil.toLocaleDateString('es-PY')}` : ''}`,
      ref: { kind: 'quote', id: quote.id },
    })),
    ...tradeIns.map(item => ({
      id: `tradein-${item.id}`,
      type: 'tradein',
      action: 'Equipo recibido en parte de pago',
      createdAt: item.createdAt,
      user: null,
      detail: `${item.model} · serial ${serialEnmascarado(item.serial) || '—'} · valuado ${formatoGs(item.valuePyg)} · ${ESTADO_TRADEIN[item.status] || item.status} · Pedido ${displayOrderNumber(item.order.orderNumber)}`,
      ref: { kind: 'order', id: item.order.id },
    })),
    ...credits.flatMap(credit => {
      const alta: TimelineEvent = {
        id: `credit-${credit.id}`,
        type: 'credit',
        action: 'Saldo a favor otorgado',
        createdAt: credit.createdAt,
        user: null,
        detail: `${formatoGs(credit.amountPyg)}${credit.order ? ` · por el pedido ${displayOrderNumber(credit.order.orderNumber)}` : ' · crédito manual'} · disponible ${formatoGs(credit.remainingPyg)}${credit.note ? ` · ${credit.note}` : ''}`,
      }
      const usos: TimelineEvent[] = credit.uses.map(use => ({
        id: `credit-use-${use.id}`,
        type: 'credit',
        action: 'Saldo a favor usado',
        createdAt: use.createdAt,
        user: null,
        detail: `${formatoGs(use.amountPyg)} aplicado al pedido ${displayOrderNumber(use.order.orderNumber)}`,
      }))
      return [alta, ...usos]
    }),
    ...cuotas.map(cuota => ({
      id: `cuota-${cuota.id}`,
      type: 'credit',
      action: 'Cuota pendiente',
      createdAt: cuota.createdAt,
      user: null,
      detail: `Pedido ${displayOrderNumber(cuota.order.orderNumber)} · ${formatoGs(cuota.amountPyg)} · vence ${(cuota.dueAt as Date).toLocaleDateString('es-PY')}`,
    })),
    ...correos.map(correo => ({
      id: `email-${correo.id}`,
      type: 'message',
      action: 'Correo enviado',
      createdAt: correo.sentAt as Date,
      user: null,
      detail: correo.aggregateType === 'Quote'
        ? `Cotización ${numeroCotizacion.get(correo.aggregateId) || ''}`.trim()
        : `Recibo del pedido ${numeroPedido.get(correo.aggregateId) || ''}`.trim(),
      ref: correo.aggregateType === 'Order' ? { kind: 'order', id: correo.aggregateId } : { kind: 'quote', id: correo.aggregateId },
    })),
    ...notes.map(note => ({
      id: `note-${note.id}`,
      type: 'note',
      action: 'Comentario del equipo',
      createdAt: note.createdAt,
      user: note.user,
      detail: note.content,
    })),
    ...notices.map(notice => ({
      id: `notice-${notice.id}`,
      type: 'notice',
      action: 'Mensaje al cliente',
      createdAt: notice.createdAt,
      user: notice.user,
      detail: notice.content,
    })),
    ...notices.filter(notice => notice.firstViewedAt).map(notice => ({
      id: `notice-${notice.id}-visto`,
      type: 'notice',
      action: 'Mensaje visto por el cliente',
      createdAt: notice.firstViewedAt as Date,
      user: null,
      detail: notice.content,
    })),
    ...followUps.flatMap(item => {
      const creado: TimelineEvent = {
        id: `followUp-${item.id}`,
        type: 'followUp',
        action: 'Seguimiento agendado',
        createdAt: item.createdAt,
        user: item.user,
        detail: `${TIPO_SEGUIMIENTO[item.kind] || 'Seguimiento'}${item.dueAt ? ` · para ${item.dueAt.toLocaleDateString('es-PY')}` : ''} · ${item.note}`,
      }
      const hecho: TimelineEvent[] = item.doneAt ? [{
        id: `followUp-${item.id}-done`,
        type: 'followUp',
        action: 'Seguimiento hecho',
        createdAt: item.doneAt,
        user: item.user,
        detail: item.note,
      }] : []
      return [creado, ...hecho]
    }),
    ...warranties.map(warranty => ({
      id: `warranty-${warranty.id}`,
      type: 'warranty',
      action: 'Garantía registrada',
      createdAt: warranty.createdAt,
      user: null,
      detail: `${warranty.description || 'Garantía'} · serial ${warranty.serial} · ${ESTADO_GARANTIA[warranty.status] || warranty.status}`,
    })),
    ...audits.map(audit => {
      const metadata = audit.metadata as Record<string, unknown> | null
      const campos = Array.isArray(metadata?.fields) ? metadata.fields as string[] : []
      // `action` conserva la acción cruda de auditoría (contrato del arnés de
      // integración); `label` es el texto legible que muestra la ficha.
      const label = audit.action === 'CUSTOMER_UPDATED' && campos.includes('pricingTier')
        ? 'Tipo de cliente actualizado'
        : ACCION_AUDITORIA[audit.action]
      return {
        id: `audit-${audit.id}`,
        type: ACCIONES_SERVICIO.has(audit.action) ? 'service' : 'audit',
        action: audit.action,
        ...(label ? { label } : {}),
        createdAt: audit.createdAt,
        user: audit.user,
        detail: detalleMetadata(audit.action, audit.metadata),
      }
    }),
  ]
  const todos = events.map(event => ({ ...event, group: grupoEvento(event) }))
  const filtrados = filtrarEventos(todos, { grupos, desde, hasta })
  filtrados.sort((a, b) => {
    const diferencia = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    return diferencia !== 0 ? diferencia : String(a.id).localeCompare(String(b.id))
  })

  // Cursor propio (no hay tabla de eventos): ISO de la fecha + id del evento.
  let inicio = 0
  if (cursor) {
    const indice = filtrados.findIndex((event) => `${new Date(event.createdAt).toISOString()}|${event.id}` === cursor)
    inicio = indice >= 0 ? indice + 1 : 0
  }
  const pagina = filtrados.slice(inicio, inicio + limit)
  const ultimo = pagina[pagina.length - 1]
  const hayMas = filtrados.length > inicio + limit && Boolean(ultimo)
  // Totales del cliente (primera página): gastado, ticket promedio, última
  // compra, frecuencia, saldo pendiente y saldo a favor.
  const pendientePyg = orders.reduce((suma, order) => {
    if (order.status === 'CANCELLED') return suma
    const pagado = order.payments.reduce((acc, payment) => acc + Number(payment.amountPyg || 0), 0)
    return suma + Math.max(0, Number(order.totalPyg || 0) - pagado)
  }, 0)
  const resumen = cursor ? undefined : {
    ...resumenCompras(orders),
    pendientePyg,
    saldoFavorPyg: credits.reduce((suma, credit) => suma + Number(credit.remainingPyg || 0), 0),
    total: filtrados.length,
  }
  return json({
    ...(resumen ? { summary: resumen } : {}),
    events: pagina,
    nextCursor: hayMas ? `${new Date(ultimo.createdAt).toISOString()}|${ultimo.id}` : null,
  })
}
