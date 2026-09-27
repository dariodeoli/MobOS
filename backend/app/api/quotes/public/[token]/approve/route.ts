import { prisma } from '../../../../../../lib/prisma'
import { error, json } from '../../../../../../lib/http'
import { InputError, textInput } from '../../../../../../lib/payment-input'
import { enforceRateLimit } from '../../../../../../lib/rate-limit'
import { esCodigoDuplicado } from '../../../../../../lib/order-number'
import {
  OTP_MAX_ATTEMPTS,
  codigoValido,
  hashDeSnapshot,
  huellaDeCliente,
  normalizarFirma,
  type SnapshotCotizacion,
} from '../../../../../../lib/quote-approval'
import { crearPedidoDeCotizacion } from '../../../../../../lib/quote-conversion'

// A3 (#279): aprobación autenticada. El cliente confirma el código OTP de la
// versión congelada y, si quiere, firma; recién ahí se crea el pedido con
// exactamente el contenido aprobado y queda la evidencia (hash, método, fecha,
// quién declaró ser y desde dónde).
const ABORTABLES = ['DRAFT', 'SENT', 'ACCEPTED'] as const

const text = (value: unknown, max = 200) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const limited = enforceRateLimit(request, 'quotes-public-approve', 20, 60_000)
  if (limited) return limited
  const { token } = await context.params
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return error('JSON inválido.') }
  const challengeId = textInput(body?.challengeId, 'challengeId', 200).trim()
  const codigo = String(body?.code ?? '').trim()
  if (!/^\d{6}$/.test(codigo)) return error('Ingresá el código de 6 dígitos.', 400)
  const firmaEnviada = body?.signature !== undefined && body?.signature !== null && body?.signature !== ''
  const firma = firmaEnviada ? normalizarFirma(body?.signature) : null
  if (firmaEnviada && !firma) return error('La firma no es una imagen válida (PNG hasta 96 KB).', 400)

  const quote = await prisma.quote.findUnique({ where: { publicToken: text(token) }, include: { customer: { select: { name: true, email: true } } } })
  if (!quote) return error('Cotización no encontrada.', 404)
  if (quote.status === 'CONVERTED' || quote.orderId) return error('Esta cotización ya tiene un pedido.', 409)
  if (!(ABORTABLES as readonly string[]).includes(quote.status)) return error('Esta cotización ya fue resuelta.', 409)
  if (quote.validUntil && quote.validUntil.getTime() < Date.now()) return error('Esta cotización venció. Pedile al vendedor una nueva.', 409)

  const { ipHash, userAgent } = huellaDeCliente(request.headers)

  const ejecutar = () => prisma.$transaction(async (tx) => {
    // Desafío bloqueado y validado con el reloj de Postgres.
    const filas = await tx.$queryRaw<Array<{ id: string; codeHash: string; channel: string; destination: string; versionId: string; attempts: number; expirado: boolean; usado: boolean }>>`
      SELECT "id", "codeHash", "channel", "destination", "versionId", "attempts",
             ("expiresAt" <= now()) AS "expirado",
             ("usedAt" IS NOT NULL) AS "usado"
      FROM "QuoteApprovalChallenge"
      WHERE "id" = ${challengeId} AND "tenantId" = ${quote.tenantId} AND "quoteId" = ${quote.id}
      FOR UPDATE`
    const desafio = filas[0]
    if (!desafio || desafio.usado) throw new InputError('Pedí un código nuevo para aprobar.', 409)
    if (desafio.expirado) throw new InputError('El código venció. Pedí uno nuevo.', 409)
    if (desafio.attempts >= OTP_MAX_ATTEMPTS) throw new InputError('Demasiados intentos con ese código. Pedí uno nuevo.', 429)

    const valido = await codigoValido(codigo, desafio.codeHash)
    if (!valido) {
      // El intento se persiste aunque la aprobación falle: el desafío queda
      // bloqueado al llegar al máximo. Para eso la transacción termina bien y
      // el error se devuelve afuera.
      const restantes = OTP_MAX_ATTEMPTS - (desafio.attempts + 1)
      await tx.quoteApprovalChallenge.update({ where: { id: desafio.id }, data: { attempts: { increment: 1 } } })
      return { ok: false as const, fallo: { status: 401, message: restantes > 0 ? `Código incorrecto. Te quedan ${restantes} intento${restantes === 1 ? '' : 's'}.` : 'Código incorrecto y sin intentos. Pedí uno nuevo.' } }
    }

    // Debe aprobarse la versión vigente: si la tienda reencuadró el presupuesto,
    // el cliente tiene que revisar y pedir un código nuevo.
    const version = await tx.quoteVersion.findFirst({ where: { quoteId: quote.id, tenantId: quote.tenantId }, orderBy: { version: 'desc' } })
    if (!version || version.id !== desafio.versionId) throw new InputError('La cotización cambió desde que pediste el código. Revisá la versión nueva y volvé a intentar.', 409)
    const snapshot = version.snapshot as unknown as SnapshotCotizacion
    const versionHash = hashDeSnapshot(snapshot)

    const consumido = await tx.$executeRaw`UPDATE "QuoteApprovalChallenge" SET "usedAt" = now() WHERE "id" = ${desafio.id} AND "usedAt" IS NULL`
    if (consumido !== 1) throw new InputError('Ese código ya fue usado. Pedí uno nuevo.', 409)

    const signerName = body?.signerName === undefined || body?.signerName === null || body?.signerName === '' ? null : textInput(body.signerName, 'Nombre', 120)
    const signerDocument = body?.signerDocument === undefined || body?.signerDocument === null || body?.signerDocument === '' ? null : textInput(body.signerDocument, 'Documento', 40)

    const pedido = await crearPedidoDeCotizacion(tx, {
      tenantId: quote.tenantId,
      branchId: quote.branchId,
      customerId: snapshot.customerId ?? quote.customerId,
      sellerId: quote.sellerId,
      items: snapshot.items,
      subtotalPyg: snapshot.subtotalPyg,
      discountPyg: snapshot.discountPyg,
      totalPyg: snapshot.totalPyg,
      notas: `Cotización ${quote.number} · aprobación online v${version.version} (${desafio.channel === 'EMAIL' ? 'correo' : 'teléfono'})`,
    })

    const aprobacion = await tx.quoteApproval.create({
      data: {
        tenantId: quote.tenantId,
        quoteId: quote.id,
        versionId: version.id,
        challengeId: desafio.id,
        status: 'APPROVED',
        method: desafio.channel === 'EMAIL' ? 'OTP_EMAIL' : 'OTP_PHONE',
        destination: desafio.destination,
        versionHash,
        signerName,
        signerDocument,
        signatureDataUrl: firma,
        ipHash,
        userAgent,
        orderId: pedido.id,
      },
      select: { id: true, method: true, destination: true, createdAt: true },
    })

    await tx.quote.updateMany({ where: { id: quote.id, status: { in: [...ABORTABLES] } }, data: { status: 'CONVERTED', orderId: pedido.id } })
    await tx.auditLog.create({ data: {
      tenantId: quote.tenantId,
      userId: null,
      action: 'QUOTE_APPROVED',
      entity: 'Quote',
      entityId: quote.id,
      metadata: {
        origin: 'public',
        method: aprobacion.method,
        destination: aprobacion.destination,
        version: version.version,
        versionHash,
        signerName,
        firmo: Boolean(firma),
        orderId: pedido.id,
        orderNumber: pedido.orderNumber,
        challengeId: desafio.id,
      },
    } })
    await tx.auditLog.create({ data: {
      tenantId: quote.tenantId,
      userId: null,
      action: 'QUOTE_CONVERTED',
      entity: 'Quote',
      entityId: quote.id,
      metadata: { origin: 'public-approval', orderId: pedido.id, orderNumber: pedido.orderNumber, version: version.version },
    } })
    return { ok: true as const, pedido, version, aprobacion, firmo: Boolean(firma) }
  })

  try {
    let resultado
    try {
      resultado = await ejecutar()
    } catch (cause) {
      if (!esCodigoDuplicado(cause)) throw cause
      resultado = await ejecutar()
    }
    if (!resultado.ok) return error(resultado.fallo.message, resultado.fallo.status)
    return json({
      status: 'APPROVED',
      orderId: resultado.pedido.id,
      orderNumber: resultado.pedido.orderNumber,
      evidence: {
        version: resultado.version.version,
        versionHash: resultado.version.hash,
        method: resultado.aprobacion.method,
        destination: resultado.aprobacion.destination,
        at: resultado.aprobacion.createdAt,
        firmo: resultado.firmo,
        orderId: resultado.pedido.id,
        orderNumber: resultado.pedido.orderNumber,
      },
    }, { status: 201 })
  } catch (cause) {
    if (cause instanceof InputError) return error(cause.message, cause.status)
    return error(cause instanceof Error ? cause.message : 'No se pudo aprobar la cotización.', 409)
  }
}
