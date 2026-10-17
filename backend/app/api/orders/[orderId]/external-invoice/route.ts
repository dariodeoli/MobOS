import { Prisma } from '@prisma/client'
import { prisma } from '../../../../../lib/prisma'
import { canAccessAny, requireSession } from '../../../../../lib/auth'
import { error, json, tenantId } from '../../../../../lib/http'
import { canAccessOrder } from '../../../../../lib/orders'
import { buildInvoicePayload, InvoicePayloadError } from '../../../../../lib/external-invoices/contracts'
import { configuredInvoiceProvider, invoiceIdempotencyKey } from '../../../../../lib/external-invoices/providers'

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const tenant = await tenantId(request)
  const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['orders:manage'])) return error('No tenés permiso para enviar pedidos a facturación.', 403)
  const provider = configuredInvoiceProvider()
  if (!provider) return error('No hay un proveedor de facturación configurado para esta tienda.', 503)

  try {
    const { orderId } = await context.params
    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId: tenant },
      include: {
        items: { orderBy: { id: 'asc' } },
        customer: { include: { addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] } } },
      },
    })
    if (!order || !canAccessOrder(session.user, order)) return error('Pedido no encontrado.', 404)
    if (order.status === 'CANCELLED') return error('Un pedido cancelado no se puede enviar a facturación.', 409)
    const payload = buildInvoicePayload({ order, customer: order.customer })
    const idempotencyKey = invoiceIdempotencyKey(tenant, order.id, provider.id)

    const previous = await prisma.externalInvoice.findUnique({ where: { orderId: order.id } })
    if (previous && previous.provider !== provider.id) return error('Este pedido ya tiene una solicitud asociada a otro proveedor.', 409)
    if (previous?.status === 'ACCEPTED') {
      return json({ status: previous.simulated ? 'SIMULATED' : 'ACCEPTED', provider: previous.provider, documentNumber: previous.documentNumber, documentUrl: previous.documentUrl })
    }

    const requestRow = await prisma.externalInvoice.upsert({
      where: { orderId: order.id },
      create: {
        tenantId: tenant, orderId: order.id, provider: provider.id, status: 'PENDING',
        idempotencyKey, simulated: provider.id === 'simulated', payload: payload as Prisma.InputJsonValue, error: null,
      },
      update: { status: 'PENDING', idempotencyKey, simulated: provider.id === 'simulated', payload: payload as Prisma.InputJsonValue, error: null, resolvedAt: null },
    })

    try {
      const result = await provider.issue(payload, requestRow.idempotencyKey)
      const saved = await prisma.$transaction(async tx => {
        const invoice = await tx.externalInvoice.update({
          where: { id: requestRow.id },
          data: { status: 'ACCEPTED', simulated: result.simulated, providerDocumentId: result.providerDocumentId, documentNumber: result.documentNumber, documentUrl: result.documentUrl, error: null, resolvedAt: new Date() },
        })
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'EXTERNAL_INVOICE_PROVIDER_ACCEPTED', entity: 'Order', entityId: order.id, metadata: { provider: provider.id, simulated: result.simulated, invoiceId: invoice.id } } })
        return invoice
      })
      return json({ status: saved.simulated ? 'SIMULATED' : 'ACCEPTED', provider: saved.provider, documentNumber: saved.documentNumber, documentUrl: saved.documentUrl })
    } catch {
      await prisma.$transaction(async tx => {
        await tx.externalInvoice.update({ where: { id: requestRow.id }, data: { status: 'FAILED', error: 'El proveedor no confirmó la solicitud.', resolvedAt: new Date() } })
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'EXTERNAL_INVOICE_PROVIDER_FAILED', entity: 'Order', entityId: order.id, metadata: { provider: provider.id, simulated: provider.id === 'simulated', invoiceId: requestRow.id } } })
      })
      return error('El proveedor no confirmó la solicitud. Podés volver a intentar de forma segura.', 502)
    }
  } catch (cause) {
    if (cause instanceof InvoicePayloadError) return error(cause.message, 400)
    return error('No se pudo preparar la solicitud de facturación.', 500)
  }
}
