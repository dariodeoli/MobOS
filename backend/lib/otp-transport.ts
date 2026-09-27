// Transporte del código OTP de la aprobación de presupuestos (A3 · #279).
// Correo: sale por la outbox transaccional existente (reintentos y auditoría).
// Teléfono: depende de un relay SMS/WhatsApp que configura Plataforma
// (`MOBOS_SMS_RELAY_URL` + `MOBOS_SMS_RELAY_TOKEN`); sin relay, el canal se
// informa como no disponible en vez de fingir un envío.
import type { Prisma } from '@prisma/client'
import { InputError } from './payment-input'
import { actionLink, emailTransportConfigured, quoteApprovalOtpEmail } from './email'
import { dispatchEmailOutboxJob, enqueueEmail, withEmailOutboxTransaction } from './email-outbox'
import type { CanalOtp } from './quote-approval'

const patronCasilla = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function smsRelay(): { url: string; token: string } | null {
  const raw = process.env.MOBOS_SMS_RELAY_URL || ''
  const token = (process.env.MOBOS_SMS_RELAY_TOKEN || '').trim()
  try {
    const url = new URL(raw)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null
    if (token.length < 16) return null
    return { url: url.href.replace(/\/$/, ''), token }
  } catch { return null }
}

export function transporteTelefonoConfigurado(): boolean {
  return Boolean(smsRelay())
}

/** Canales que el cliente puede usar según sus datos y el transporte activo. */
export function canalesOtpDisponibles(cliente: { email?: string | null; phone?: string | null } | null | undefined) {
  const email = String(cliente?.email || '').trim()
  const phone = String(cliente?.phone || '').trim()
  return {
    email: Boolean(patronCasilla.test(email)),
    phone: Boolean(phone) && transporteTelefonoConfigurado(),
  }
}

export type EnvioOtp = { enviado: boolean; motivo: string | null }

/**
 * Envía (o encola) el código. Devuelve si el transporte lo tomó; el desafío ya
 * existe aunque el envío quede pendiente, así que nunca se pierde el estado.
 */
export async function enviarOtpDeCotizacion(input: {
  tenantId: string
  quoteId: string
  quoteNumber: string
  customerName: string
  companyName?: string
  channel: CanalOtp
  destination: string
  code: string
  link?: string | null
  idempotencyKey: string
}): Promise<EnvioOtp> {
  if (input.channel === 'PHONE') {
    const relay = smsRelay()
    if (!relay) throw new InputError('El envío por teléfono todavía no está disponible en esta tienda. Usá el correo.', 409)
    const text = `MobOS · Tu código para aprobar la cotización ${input.quoteNumber} es ${input.code}. Vence en 10 minutos y es de un solo uso.`
    try {
      const response = await fetch(relay.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Mobos-Relay-Token': relay.token },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({ project: 'mobos', to: input.destination, text, idempotencyKey: input.idempotencyKey }),
      })
      return { enviado: response.ok, motivo: response.ok ? null : 'El relay de mensajes rechazó el envío.' }
    } catch {
      return { enviado: false, motivo: 'No se pudo contactar el relay de mensajes.' }
    }
  }

  const mensaje = quoteApprovalOtpEmail({
    to: input.destination,
    customerName: input.customerName,
    number: input.quoteNumber,
    code: input.code,
    companyName: input.companyName,
    minutes: 10,
    link: input.link || null,
  })
  if (!mensaje) throw new InputError('El correo del cliente no es válido para enviar el código.', 409)

  let outboxId = ''
  await withEmailOutboxTransaction('quote-approval-otp', async (tx: Prisma.TransactionClient) => {
    const fila = await enqueueEmail(tx, {
      tenantId: input.tenantId,
      kind: 'quote-approval-otp',
      aggregateType: 'Quote',
      aggregateId: input.quoteId,
      message: { to: mensaje.to, subject: mensaje.subject, html: mensaje.html, text: mensaje.text },
      idempotencyKey: input.idempotencyKey,
    })
    outboxId = fila.id
  })
  // Sin relay configurado el correo queda en cola (el desafío igual sirve).
  if (!emailTransportConfigured()) return { enviado: false, motivo: 'El transporte de correo no está configurado; el envío quedó en cola.' }
  const despacho = await dispatchEmailOutboxJob(outboxId)
  return {
    enviado: despacho.state === 'sent',
    motivo: despacho.state === 'sent' ? null : despacho.state === 'failed' ? 'El relay de correo rechazó el envío; reintentamos automáticamente.' : 'El envío quedó en cola y sale en el próximo reintento.',
  }
}

/** Enlace público de la cotización (para el botón de respaldo del correo). */
export function enlaceDeCotizacion(publicToken: string | null | undefined): string | null {
  return publicToken ? actionLink('/cotizacion', publicToken) : null
}
