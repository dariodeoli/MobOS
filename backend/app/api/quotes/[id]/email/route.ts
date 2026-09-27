import { error, json, tenantId } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { prisma } from '../../../../../lib/prisma'
import { enviarCotizacionPorCorreo } from '../../../../../lib/quote-email'
import { congelarVersionDeCotizacion } from '../../../../../lib/quote-approval'
import { numero } from '../../../../../lib/montos'

// Envío de la cotización por correo (pedido de Dario, junto con POS/PRN):
// usa el transporte existente (outbox + relay) con idempotencia por cotización
// y versión, marca la cotización como enviada si era borrador y deja el rastro
// en la cronología (auditoría de la cotización y del cliente).
type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: RouteContext) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)

  const { id } = await params
  const cotizacion = await prisma.quote.findFirst({
    where: { id: String(id || ''), tenantId: tenant },
    include: { customer: { select: { id: true, name: true, email: true } } },
  })
  if (!cotizacion) return error('Cotización no encontrada.', 404)
  if (session.user.role === 'VENDEDOR' && cotizacion.sellerId !== session.user.id && cotizacion.branchId !== session.user.branchId) return error('No autorizado.', 403)

  let body: { to?: unknown; forzar?: unknown; reintento?: unknown } = {}
  try { body = await request.json() } catch { /* sin cuerpo: usa el correo del cliente */ }
  const forzar = body?.forzar === true || body?.reintento === true
  const casillaPedida = typeof body?.to === 'string' ? body.to.trim() : ''
  const to = casillaPedida || String(cotizacion.customer?.email || '').trim()
  if (!to) return json({ message: 'El cliente todavía no tiene correo.', faltaEmail: true, customerId: cotizacion.customerId }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ message: `La casilla «${to}» no parece válida.` }, { status: 400 })
  if (!cotizacion.publicToken) return json({ message: 'La cotización no tiene enlace público: regeneralo antes de enviarla.', faltaEnlace: true }, { status: 400 })

  const tienda = await prisma.tenant.findUnique({ where: { id: tenant }, select: { name: true } })

  let envio
  try {
    // A3 (#279): el envío congela la versión que el cliente va a revisar.
    await prisma.$transaction(tx => congelarVersionDeCotizacion(tx, cotizacion, { frozenById: session.user.id, motivo: 'email' }))
    envio = await enviarCotizacionPorCorreo({
      tenantId: tenant,
      to,
      reintento: forzar,
      companyName: tienda?.name || '',
      cotizacion: {
        id: cotizacion.id,
        number: cotizacion.number,
        customerName: cotizacion.customer?.name || cotizacion.customerName,
        customerId: cotizacion.customerId,
        publicToken: cotizacion.publicToken,
        subtotalPyg: numero(cotizacion.subtotalPyg),
        discountPyg: numero(cotizacion.discountPyg),
        totalPyg: numero(cotizacion.totalPyg),
        validUntil: cotizacion.validUntil,
        notes: cotizacion.notes,
        items: cotizacion.items,
        status: cotizacion.status,
        updatedAt: cotizacion.updatedAt,
      },
    })
  } catch (cause) {
    const mensaje = cause instanceof Error ? cause.message : ''
    if (mensaje === 'EMAIL_TRANSPORT_NOT_CONFIGURED') return json({ message: 'El envío de correo no está configurado en esta instalación.', configurado: false }, { status: 503 })
    if (mensaje === 'EMAIL_QUOTE_INCOMPLETA') return json({ message: 'La cotización necesita al menos un ítem para enviarse.' }, { status: 400 })
    throw cause
  }

  // Rastro: estado enviada (si era borrador) y cronología de la cotización y
  // del cliente (la ficha del cliente lee `metadata.customerId`).
  let estado = cotizacion.status
  if (envio.estado === 'enviado' || envio.estado === 'encolado') {
    if (cotizacion.status === 'DRAFT') {
      estado = 'SENT'
      await prisma.$transaction(async (tx) => {
        await tx.quote.update({ where: { id: cotizacion.id }, data: { status: 'SENT' } })
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'QUOTE_UPDATED', entity: 'Quote', entityId: cotizacion.id, metadata: { from: 'DRAFT', to: 'SENT' } } })
      })
    }
    await prisma.auditLog.create({
      data: {
        tenantId: tenant,
        userId: session.user.id,
        action: 'QUOTE_EMAIL_SENT',
        entity: 'Quote',
        entityId: cotizacion.id,
        metadata: { customerId: cotizacion.customerId, customerName: cotizacion.customer?.name || cotizacion.customerName, number: cotizacion.number, to: envio.to, outboxId: envio.outboxId, reintento: forzar, estado: envio.estado },
      },
    })
  }

  return json({ ...envio, cotizacion: { id: cotizacion.id, number: cotizacion.number, status: estado } })
}
