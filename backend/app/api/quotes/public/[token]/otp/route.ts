import { prisma } from '../../../../../../lib/prisma'
import { error, json } from '../../../../../../lib/http'
import { enforceRateLimit } from '../../../../../../lib/rate-limit'
import {
  OTP_MAX_ATTEMPTS,
  OTP_REENVIO_MS,
  OTP_TTL_MS,
  congelarVersionDeCotizacion,
  enmascararEmail,
  enmascararTelefono,
  generarCodigoOtp,
  hashDeCodigo,
  hashDeDestino,
} from '../../../../../../lib/quote-approval'
import { canalesOtpDisponibles, enlaceDeCotizacion, enviarOtpDeCotizacion } from '../../../../../../lib/otp-transport'
import { InputError } from '../../../../../../lib/payment-input'

// A3 (#279): el cliente pide un código para aprobar la cotización desde el
// enlace público. El canal se elige según sus datos (correo/teléfono) y el
// transporte activo; el código nunca viaja al navegador ni se guarda en claro.
const ABORTABLES = ['DRAFT', 'SENT', 'ACCEPTED']
const MAX_DESAFIOS_POR_HORA = 8

const text = (value: unknown, max = 200) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const limited = enforceRateLimit(request, 'quotes-public-otp', 10, 60_000)
  if (limited) return limited
  const { token } = await context.params
  let body: { channel?: unknown; version?: unknown }
  try { body = await request.json() } catch { body = {} }
  const canal = body?.channel === 'phone' || body?.channel === 'PHONE' ? 'PHONE' : 'EMAIL'

  const quote = await prisma.quote.findUnique({
    where: { publicToken: text(token) },
    include: {
      customer: { select: { id: true, name: true, email: true, phone: true, countryCode: true } },
      tenant: { select: { name: true } },
    },
  })
  if (!quote) return error('Cotización no encontrada.', 404)
  if (!ABORTABLES.includes(quote.status)) return error('Esta cotización ya fue resuelta.', 409)
  if (quote.validUntil && quote.validUntil.getTime() < Date.now()) return error('Esta cotización venció. Pedile al vendedor una nueva.', 409)
  const items = Array.isArray(quote.items) ? quote.items : []
  if (!items.length) return error('La cotización no tiene ítems.', 409)

  const disponibles = canalesOtpDisponibles(quote.customer)
  if (canal === 'EMAIL' && !disponibles.email) return error('La tienda no tiene tu correo cargado. Pedile al vendedor que lo agregue.', 409)
  if (canal === 'PHONE' && !disponibles.phone) return error('El envío por teléfono no está disponible. Usá el correo.', 409)

  const versionPedida = Number(body?.version) > 0 ? Number(body.version) : null
  // Versión antes que anti-spam: una pestaña desactualizada recibe el aviso de
  // versión nueva (409), no un 429 que no explica nada.
  const versionVigente = await prisma.quoteVersion.findFirst({ where: { quoteId: quote.id, tenantId: quote.tenantId }, orderBy: { version: 'desc' } })
  if (versionVigente && versionPedida !== null && versionPedida !== versionVigente.version) {
    return error('Hay una versión nueva del presupuesto. Recargá la página para revisarla.', 409)
  }

  // Reenvío inmediato: se respeta un minuto entre códigos del mismo enlace.
  const ultimo = await prisma.quoteApprovalChallenge.findFirst({ where: { quoteId: quote.id, tenantId: quote.tenantId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
  if (ultimo && Date.now() - ultimo.createdAt.getTime() < OTP_REENVIO_MS) {
    return error('Ya enviamos un código hace un momento. Esperá un minuto antes de pedir otro.', 429)
  }
  const recientes = await prisma.quoteApprovalChallenge.count({ where: { quoteId: quote.id, tenantId: quote.tenantId, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } } })
  if (recientes >= MAX_DESAFIOS_POR_HORA) return error('Ya se pidieron varios códigos para esta cotización. Probá más tarde o pedile al vendedor que reenvíe el enlace.', 429)

  // La aprobación siempre ocurre sobre una versión congelada. Si ya hay una
  // (el cliente está viendo esa), se usa; si no (enlace legacy), se congela el
  // contenido vigente.
  let desafio
  let codigo = ''
  try {
    const creado = await prisma.$transaction(async (tx) => {
      let version = await tx.quoteVersion.findFirst({ where: { quoteId: quote.id, tenantId: quote.tenantId }, orderBy: { version: 'desc' } })
      if (version && versionPedida !== null && versionPedida !== version.version) throw new InputError('Hay una versión nueva del presupuesto. Recargá la página para revisarla.', 409)
      if (!version) version = await congelarVersionDeCotizacion(tx, quote, { frozenById: null, motivo: 'otp' })
      const codigo = generarCodigoOtp()
      const destino = canal === 'EMAIL' ? String(quote.customer?.email || '').trim() : `${quote.customer?.countryCode || ''}${quote.customer?.phone || ''}`.trim()
      const fila = await tx.quoteApprovalChallenge.create({
        data: {
          tenantId: quote.tenantId,
          quoteId: quote.id,
          versionId: version.id,
          channel: canal,
          destination: canal === 'EMAIL' ? enmascararEmail(destino) : enmascararTelefono(destino),
          destinationHash: hashDeDestino(canal, destino),
          codeHash: await hashDeCodigo(codigo),
          expiresAt: new Date(Date.now() + OTP_TTL_MS),
        },
        select: { id: true, channel: true, destination: true, expiresAt: true },
      })
      return { fila, codigo }
    })
    desafio = creado.fila
    codigo = creado.codigo
  } catch (cause) {
    if (cause instanceof InputError) return error(cause.message, cause.status)
    return error(cause instanceof Error ? cause.message : 'No se pudo generar el código.', 409)
  }

  const destino = canal === 'EMAIL' ? String(quote.customer?.email || '').trim() : `${quote.customer?.countryCode || ''}${quote.customer?.phone || ''}`.trim()
  let envio = { enviado: false, motivo: null as string | null }
  try {
    envio = await enviarOtpDeCotizacion({
      tenantId: quote.tenantId,
      quoteId: quote.id,
      quoteNumber: quote.number,
      customerName: quote.customer?.name || quote.customerName,
      companyName: quote.tenant?.name,
      channel: canal,
      destination: destino,
      code: codigo,
      link: enlaceDeCotizacion(quote.publicToken),
      idempotencyKey: `quote-approval-otp:${desafio.id}`,
    })
  } catch (cause) {
    // El desafío ya existe; si el transporte no está disponible se informa el
    // motivo real y el cliente puede reintentar o pedir el enlace de nuevo.
    envio = { enviado: false, motivo: cause instanceof Error ? cause.message : 'No se pudo enviar el código.' }
  }

  return json({
    challengeId: desafio.id,
    channel: desafio.channel,
    destination: desafio.destination,
    expiresAt: desafio.expiresAt,
    maxAttempts: OTP_MAX_ATTEMPTS,
    enviado: envio.enviado,
    motivo: envio.motivo,
  }, { status: 201 })
}
