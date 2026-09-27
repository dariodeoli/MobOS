import { Prisma } from '@prisma/client'
import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { actionLink } from '../../../../../lib/email'
import { enqueueEmail } from '../../../../../lib/email-outbox'
import { quoteEmail } from '../../../../../lib/email'
import { mensajeCotizacion } from '../../../../../lib/quote-message'
import { internationalPhone } from '../../../../../lib/validation'
import { numero } from '../../../../../lib/montos'

// Envío de la cotización al cliente (#261): mensaje profesional para WhatsApp
// (texto + enlace público) y correo al email registrado. Cada envío queda en la
// auditoría y en la cronología del cliente; la cotización en borrador pasa a
// «enviada» al compartirse.
//
// GET  → vista previa del mensaje (sin efectos ni auditoría).
// POST → canal WHATSAPP (devuelve el texto y el enlace de wa.me) o EMAIL
//        (encola el correo). Requiere que el cliente tenga teléfono/correo.

type Canal = 'WHATSAPP' | 'EMAIL'

const texto = (value: unknown, max = 200) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : '')

function canalValido(value: unknown): Canal | null {
  const canal = texto(value, 20).toUpperCase()
  return canal === 'WHATSAPP' || canal === 'EMAIL' ? canal : null
}

function etiquetaMedio(canal: Canal, destino: string) {
  return canal === 'EMAIL' ? `por correo${destino ? ` a ${destino}` : ''}` : 'por WhatsApp'
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const { id } = await context.params
  const tenant = session.user.tenantId
  const quote = await prisma.quote.findFirst({
    where: { id: id.slice(0, 128), tenantId: tenant },
    include: { customer: { select: { id: true, name: true, phone: true, countryCode: true, email: true } }, tenant: { select: { name: true } } },
  })
  if (!quote) return error('Cotización no encontrada.', 404)
  if (session.user.role === 'VENDEDOR' && quote.sellerId !== session.user.id && quote.branchId !== session.user.branchId) return error('No autorizado.', 403)
  const items = Array.isArray(quote.items) ? quote.items as Array<Record<string, unknown>> : []
  const link = actionLink(`/cotizacion/${quote.publicToken || ''}`)
  if (!link) return error('No se pudo armar el enlace público de la cotización.', 500)
  const message = mensajeCotizacion({
    quoteNumber: quote.number,
    customerName: quote.customer?.name || quote.customerName,
    companyName: quote.tenant?.name,
    items: items.map((item) => ({ description: texto(item.description), quantity: Number(item.quantity) || 1, totalPyg: Number(item.totalPyg) || 0 })),
    totalPyg: numero(quote.totalPyg),
    validUntil: quote.validUntil,
    link,
  })
  const phone = internationalPhone(quote.customer?.phone, quote.customer?.countryCode)
  return json({
    quoteNumber: quote.number,
    status: quote.status,
    link,
    message,
    phone,
    whatsappUrl: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : '',
    email: quote.customer?.email || null,
  })
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const { id } = await context.params
  const tenant = session.user.tenantId
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const canal = canalValido(body?.canal)
  if (!canal) return error('Indicá el canal: WhatsApp o correo.')
  const quote = await prisma.quote.findFirst({
    where: { id: id.slice(0, 128), tenantId: tenant },
    include: { customer: { select: { id: true, name: true, phone: true, countryCode: true, email: true } }, tenant: { select: { name: true } } },
  })
  if (!quote) return error('Cotización no encontrada.', 404)
  if (session.user.role === 'VENDEDOR' && quote.sellerId !== session.user.id && quote.branchId !== session.user.branchId) return error('No autorizado.', 403)
  if (quote.status === 'CANCELLED') return error('La cotización está cancelada; no se puede enviar.', 409)

  const items = Array.isArray(quote.items) ? quote.items as Array<Record<string, unknown>> : []
  const link = actionLink(`/cotizacion/${quote.publicToken || ''}`)
  if (!link) return error('No se pudo armar el enlace público de la cotización.', 500)
  const lineas = items.map((item) => { const cantidad = Number(item.quantity) || 1; const unitario = Number(item.unitPricePyg) || Math.round((Number(item.totalPyg) || 0) / cantidad); return { quantity: cantidad, description: texto(item.description) || 'Producto', unitPricePyg: unitario, totalPyg: unitario * cantidad } })
  const mensaje = mensajeCotizacion({
    quoteNumber: quote.number,
    customerName: quote.customer?.name || quote.customerName,
    companyName: quote.tenant?.name,
    items: lineas,
    totalPyg: numero(quote.totalPyg),
    validUntil: quote.validUntil,
    link,
  })

  const phone = internationalPhone(quote.customer?.phone, quote.customer?.countryCode)
  const email = quote.customer?.email || ''
  if (canal === 'WHATSAPP' && !phone) return error('El cliente no tiene teléfono cargado. Completalo en su ficha para enviar por WhatsApp.', 409)
  if (canal === 'EMAIL' && !email) return error('El cliente no tiene correo cargado. Agregalo en su ficha para enviar la cotización.', 409)

  const destino = canal === 'EMAIL' ? email : phone
  const enviar = async (tx: Prisma.TransactionClient) => {
    // Compartir la cotización en borrador la deja «enviada» (estado SENT).
    let status = quote.status
    if (status === 'DRAFT') {
      const updated = await tx.quote.update({ where: { id: quote.id }, data: { status: 'SENT' }, select: { status: true } })
      status = updated.status
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'QUOTE_UPDATED', entity: 'Quote', entityId: quote.id, metadata: { from: 'DRAFT', to: 'SENT', motivo: 'envio' } } })
    }
    await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'QUOTE_MESSAGE_SENT', entity: 'Quote', entityId: quote.id, metadata: { canal, destino, quoteNumber: quote.number } } })
    if (quote.customerId) {
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'CUSTOMER_QUOTE_SHARED', entity: 'Customer', entityId: quote.customerId, metadata: { canal, destino, quoteNumber: quote.number } } })
    }
    if (canal === 'EMAIL') {
      const message = quoteEmail({
        to: email,
        customerName: quote.customer?.name || quote.customerName,
        number: quote.number,
        items: lineas,
        subtotalPyg: numero(quote.subtotalPyg),
        discountPyg: numero(quote.discountPyg),
        totalPyg: numero(quote.totalPyg),
        validUntil: quote.validUntil,
        link,
        companyName: quote.tenant?.name,
      })
      if (!message) throw new Error('No se pudo preparar el correo de la cotización.')
      await enqueueEmail(tx, { tenantId: tenant, kind: 'quote', aggregateType: 'Quote', aggregateId: quote.id, message })
    }
    return status
  }

  try {
    const status = await prisma.$transaction(enviar)
    return json({
      ok: true,
      canal,
      status,
      quoteNumber: quote.number,
      to: destino,
      link,
      ...(canal === 'WHATSAPP' ? { message: mensaje, whatsappUrl: `https://wa.me/${phone}?text=${encodeURIComponent(mensaje)}` } : { queued: true }),
    })
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo enviar la cotización.', 500)
  }
}
