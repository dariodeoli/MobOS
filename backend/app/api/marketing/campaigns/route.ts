import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { hasPermission, requireSession } from '../../../../lib/auth'
import { internationalPhone } from '../../../../lib/validation'
import { formatearGs, renderPlantilla } from '../../../../lib/collections'
import { consultarClientes } from '../../../../lib/customer-segments'
import { SEGMENTOS, clasificarCliente, motivoNoElegible, opcionesSegmento, type SegmentoKey } from '../../../../lib/segments'

// Campañas de recompra: se elige un segmento y una plantilla de clientes, y el
// servidor arma el enlace wa.me de cada destinatario. El envío real lo hace una
// persona (no hay credenciales de WhatsApp Business), por eso la campaña queda
// registrada con a quién se le envió y cuándo, y los clientes contactados
// entran en la ventana de enfriamiento para no repetir.
const MAX_DESTINATARIOS = 500
const MOTIVOS: Record<string, string> = {
  sin_telefono: 'Sin teléfono',
  sin_opt_in: 'Sin consentimiento de WhatsApp',
  contactado_reciente: 'Contactado hace poco',
  fuera_segmento: 'Ya no cumple el segmento',
}

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!hasPermission(session.user, 'marketing:manage')) return error('No autorizado.', 403)
  const campaigns = await prisma.marketingCampaign.findMany({
    where: { tenantId: session.user.tenantId },
    select: {
      id: true, name: true, segment: true, templateKey: true, recipientCount: true, skippedCount: true, createdAt: true,
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return json({ campaigns, segmentos: SEGMENTOS })
}

export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!hasPermission(session.user, 'marketing:manage')) return error('No autorizado.', 403)
  const tenantId = session.user.tenantId
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const segment = (typeof body.segment === 'string' ? body.segment.trim().toUpperCase() : '') as SegmentoKey
  if (!SEGMENTOS.some((item) => item.key === segment)) return error('Segmento inválido.')
  const templateKey = typeof body.templateKey === 'string' ? body.templateKey.trim().slice(0, 64) : ''
  if (!templateKey) return error('Elegí la plantilla del mensaje.')
  const rawIds = Array.isArray(body.customerIds) ? body.customerIds : []
  const ids = [...new Set(rawIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0 && id.length <= 100))]
  if (!ids.length) return error('Elegí al menos un cliente para la campaña.')
  if (ids.length > MAX_DESTINATARIOS) return error(`La campaña admite hasta ${MAX_DESTINATARIOS} clientes.`)
  const opciones = opcionesSegmento({
    days: body.days ?? undefined,
    minOrders: body.minOrders ?? undefined,
    category: body.category ?? undefined,
    cooldownDays: body.cooldownDays ?? undefined,
  })
  const template = await prisma.messageTemplate.findUnique({ where: { tenantId_key: { tenantId, key: templateKey } }, select: { key: true, body: true, isActive: true, category: true } })
  if (!template || template.category !== 'CUSTOMERS') return error('Plantilla de clientes no encontrada.', 404)
  if (template.isActive === false) return error('La plantilla está inactiva.', 409)
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } })
  const empresa = tenant?.name?.trim() || 'la tienda'
  const now = new Date()
  const clientes = await consultarClientes(tenantId, { ids })
  if (!clientes.length) return error('No se encontraron clientes para la campaña.', 404)
  const recipients: Array<{ customerId: string; name: string; phone: string; whatsappUrl: string; message: string }> = []
  const skipped: Array<{ customerId: string; name: string; reason: string; detalle: string }> = []
  for (const cliente of clientes) {
    if (!clasificarCliente(cliente, segment, opciones, now)) {
      skipped.push({ customerId: cliente.id, name: cliente.name, reason: 'fuera_segmento', detalle: MOTIVOS.fuera_segmento })
      continue
    }
    const reason = motivoNoElegible(cliente, now, opciones.cooldownDays)
    if (reason) {
      skipped.push({ customerId: cliente.id, name: cliente.name, reason, detalle: MOTIVOS[reason] || reason })
      continue
    }
    const numero = internationalPhone(cliente.phone, cliente.countryCode)
    const variables: Record<string, string> = {
      cliente: cliente.name || 'cliente',
      nombre: (cliente.name || 'cliente').split(' ')[0],
      customer_name: cliente.name || 'cliente',
      empresa,
      sucursal: empresa,
      branch_name: empresa,
      saldo_pendiente: formatearGs(cliente.outstandingPyg),
      total: formatearGs(cliente.totalSpentPyg),
      ultima_compra: cliente.lastOrderAt ? new Date(cliente.lastOrderAt).toLocaleDateString('es-PY') : '',
      categoria: cliente.categories[0] ?? '',
      vendedor: '',
    }
    const message = renderPlantilla(template.body, variables).trim()
    recipients.push({ customerId: cliente.id, name: cliente.name, phone: cliente.phone || '', whatsappUrl: `https://wa.me/${numero}?text=${encodeURIComponent(message)}`, message })
  }
  const defaultName = `${SEGMENTOS.find((item) => item.key === segment)?.nombre || 'Campaña'} ${now.toLocaleDateString('es-PY')}`
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : defaultName
  const campaign = await prisma.$transaction(async tx => {
    const created = await tx.marketingCampaign.create({
      data: {
        tenantId, name, segment, templateKey,
        message: template.body,
        segmentParams: { ...opciones },
        recipientCount: recipients.length,
        skippedCount: skipped.length,
        createdById: session.user.id,
      },
      select: { id: true, name: true, segment: true, templateKey: true, recipientCount: true, skippedCount: true, createdAt: true },
    })
    if (recipients.length) {
      await tx.marketingRecipient.createMany({ data: recipients.map((row) => ({ tenantId, campaignId: created.id, customerId: row.customerId, phone: row.phone })) })
      await tx.customer.updateMany({ where: { tenantId, id: { in: recipients.map((row) => row.customerId) } }, data: { marketingContactedAt: now } })
      await tx.auditLog.createMany({
        data: recipients.map((row) => ({
          tenantId, userId: session.user.id, action: 'MARKETING_WHATSAPP_SENT', entity: 'Customer', entityId: row.customerId,
          metadata: { campaignId: created.id, segment, templateKey, name: created.name },
        })),
      })
    }
    await tx.auditLog.create({
      data: {
        tenantId, userId: session.user.id, action: 'MARKETING_CAMPAIGN_CREATED', entity: 'MarketingCampaign', entityId: created.id,
        metadata: { name: created.name, segment, templateKey, recipients: recipients.length, skipped: skipped.length },
      },
    })
    return created
  })
  return json({ ok: true, campaign, recipients, skipped }, { status: 201 })
}
