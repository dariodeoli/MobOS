import { randomUUID } from 'node:crypto'
import { error, json } from '../../../../lib/http'
import { logError, logInfo } from '../../../../lib/log'
import { demoDocumentEmail, emailTransportConfigured, sendTransactionalEmail } from '../../../../lib/email'
import { publicRucOriginAllowed } from '../../../../lib/ruc-public'
import { hashToken } from '../../../../lib/auth'
import { DEMO_EMAIL_LIMITS, DemoEmailError, demoEmailEnabled, demoValidUntilLabel, maskDemoEmail, parseDemoEmailRequest } from '../../../../lib/demo-email'
import { reserveDemoEmailQuota } from '../../../../lib/demo-email-quota'

export const dynamic = 'force-dynamic'

function privateResponse(response: Response) {
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

async function readBody(request: Request) {
  const declared = Number(request.headers.get('content-length') || 0)
  if (declared > DEMO_EMAIL_LIMITS.bodyBytes) throw new DemoEmailError('invalid_request', 'Solicitud demasiado grande.', 413)
  const text = await request.text()
  if (text.length > DEMO_EMAIL_LIMITS.bodyBytes) throw new DemoEmailError('invalid_request', 'Solicitud demasiado grande.', 413)
  try { return JSON.parse(text) } catch { throw new DemoEmailError('invalid_request', 'Solicitud inválida.', 400) }
}

/** POST público de la demo: envía UN correo con datos ficticios del pedido/cotización. */
export async function POST(request: Request) {
  try {
    if (!publicRucOriginAllowed(request.headers.get('origin'))) throw new DemoEmailError('origin_forbidden', 'Origen no permitido.', 403)
    // Apagado: ni se lee el cuerpo ni se gasta cuota; la demo muestra el correo en un popup.
    if (!demoEmailEnabled()) throw new DemoEmailError('demo_email_disabled', 'El envío de correos de la demo está desactivado.', 503)
    const parsed = parseDemoEmailRequest(await readBody(request))
    if (!emailTransportConfigured()) throw new DemoEmailError('demo_email_unavailable', 'El envío de correos no está disponible por ahora.', 503)
    const message = demoDocumentEmail({
      to: parsed.email, kind: parsed.kind, number: parsed.number, customerName: parsed.customerName,
      items: parsed.items, discountPyg: parsed.discountPyg, totalPyg: parsed.totalPyg, validUntilLabel: demoValidUntilLabel(parsed.validUntil),
    })
    if (!message) throw new DemoEmailError('demo_email_unavailable', 'El envío de correos no está disponible por ahora.', 503)
    await reserveDemoEmailQuota(request, parsed.email)
    const sent = await sendTransactionalEmail({ to: message.to, subject: message.subject, html: message.html, text: message.text, idempotencyKey: `demo-email:${randomUUID()}` })
    // Auditoría: el AuthAttempt de la cuota registra el envío; acá queda el resultado sin el correo completo.
    logInfo('demo_email', { kind: parsed.kind, outcome: sent ? 'delivered-to-relay' : 'delivery-failed', to: maskDemoEmail(parsed.email), recipientHash: hashToken(parsed.email).slice(0, 12) })
    if (!sent) throw new DemoEmailError('demo_email_failed', 'No pudimos enviar el correo. Probá de nuevo en unos minutos.', 502)
    return privateResponse(json({ sent: true, kind: parsed.kind }))
  } catch (cause) {
    if (cause instanceof DemoEmailError) {
      const retry = cause.retryAfterSeconds
      const safeRetry = retry && Number.isSafeInteger(retry) && retry > 0 ? retry : undefined
      const response = error(cause.message, cause.status, { code: cause.code, ...(safeRetry ? { quotaRetryAfter: safeRetry } : {}) })
      if (safeRetry) response.headers.set('Retry-After', String(safeRetry))
      return privateResponse(response)
    }
    logError('demo_email_unavailable', { code: 'unexpected_failure' })
    return privateResponse(error('No pudimos enviar el correo. Probá de nuevo en unos minutos.', 503, { code: 'demo_email_unavailable' }))
  }
}
