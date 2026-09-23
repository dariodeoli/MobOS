import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { actionLink, deviceReportEmail, emailTransportConfigured, logEmailOutcome, sendTransactionalEmail } from '../../../../../lib/email'
import { serialSeguimiento } from '../../../../../lib/device-report'

type RouteContext = { params: Promise<{ id: string }> }

// Compartir el informe de dispositivo del cliente (#240 ítem 3): registra el
// envío en la cronología del cliente (auditoría) y, si el canal es correo,
// manda el link público con su respaldo visible. WhatsApp se abre en el
// navegador del vendedor; acá solo queda el registro.
export async function POST(request: Request, context: RouteContext) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const { id } = await context.params
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const serial = typeof body?.serial === 'string' ? body.serial.trim().slice(0, 64) : ''
  const canal = body?.canal === 'EMAIL' ? 'EMAIL' : 'WHATSAPP'
  if (serial.length < 6) return error('Serial inválido.')

  const customer = await prisma.customer.findFirst({
    where: { id: String(id || '').trim().slice(0, 128), tenantId: session.user.tenantId },
    select: { id: true, name: true, email: true },
  })
  if (!customer) return error('Cliente no encontrado.', 404)

  const link = actionLink(`/u/${encodeURIComponent(serial)}`) || `/u/${encodeURIComponent(serial)}`
  let emailEnviado = false

  if (canal === 'EMAIL') {
    if (!customer.email) return error('El cliente no tiene correo cargado: usá WhatsApp o cargá el correo en la ficha.', 400)
    const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { name: true } })
    const mensaje = deviceReportEmail({
      to: customer.email,
      customerName: customer.name,
      model: typeof body?.model === 'string' ? body.model.slice(0, 150) : 'equipo',
      link,
      companyName: tenant?.name || 'MobOS',
    })
    if (!mensaje) return error('No se pudo preparar el correo: revisá el correo del cliente.')
    emailEnviado = await sendTransactionalEmail({ ...mensaje, idempotencyKey: `device-report:${customer.id}:${serial}:${Date.now()}` })
    logEmailOutcome('device-report', emailEnviado ? 'delivered-to-relay' : emailTransportConfigured() ? 'delivery-failed' : 'unconfigured')
    if (!emailEnviado) return error('No se pudo enviar el correo: el canal de correo no está configurado. Compartilo por WhatsApp o pegá el enlace.', 502)
  }

  await prisma.auditLog.create({
    data: {
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: 'CUSTOMER_DEVICE_REPORT_SHARED',
      entity: 'Customer',
      entityId: customer.id,
      metadata: { serial, canal, link, ...(emailEnviado && customer.email ? { email: customer.email } : {}) },
    },
  })

  // Seguimiento (#240 ítem 3): el envío queda como fila del equipo para que la
  // ficha muestre visto/no visto cuando el cliente abra el link público. El
  // serial se guarda normalizado: la apertura lo busca sin distinguir caja.
  await prisma.deviceReportShare.upsert({
    where: { tenantId_serial: { tenantId: session.user.tenantId, serial: serialSeguimiento(serial) } },
    create: {
      tenantId: session.user.tenantId,
      customerId: customer.id,
      serial: serialSeguimiento(serial),
      channel: canal,
      sharedAt: new Date(),
    },
    update: { customerId: customer.id, channel: canal, sharedAt: new Date() },
  })

  return json({ link, canal, emailEnviado })
}
