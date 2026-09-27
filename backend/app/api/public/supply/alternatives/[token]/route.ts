import { prisma } from '../../../../../../lib/prisma'
import { error, json } from '../../../../../../lib/http'
import { InputError, objectInput } from '../../../../../../lib/payment-input'
import { estadoNecesidadTras, hashToken, otpValido, otpVigente, requiereAprobacionCliente, resumenAlternativa } from '../../../../../../lib/supply-alternatives'
import { OTP_MAX_INTENTOS } from '../../../../../../lib/supply-alternatives'

// A5 (#279) · El **cliente aprueba** por el enlace público (sin sesión): ve la
// opción, la diferencia de precio y el historial de versiones; si hay
// diferencia, confirma con el OTP. La necesidad original se libera recién al
// aceptar. Nunca se sustituye automáticamente.

async function alternativaPorToken(token: string) {
  return prisma.supplyAlternative.findFirst({
    where: { publicTokenHash: hashToken(token.slice(0, 200)) },
    include: {
      supplyNeed: { select: { id: true, productId: true, condition: true, quantity: true, promisedAt: true, status: true, customer: { select: { name: true } }, product: { select: { name: true, sku: true } } } },
    },
  })
}

const versionesDe = (supplyNeedId: string) => prisma.supplyAlternative.findMany({
  where: { supplyNeedId },
  orderBy: { version: 'asc' },
  select: { version: true, status: true, optionSummary: true, priceDeltaPyg: true, newEta: true, decidedAt: true, customerApprovedAt: true, customerRejectedAt: true },
})

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const alternativa = await alternativaPorToken(token)
  if (!alternativa) return error('Propuesta no encontrada.', 404)
  return json({
    alternative: {
      id: alternativa.id,
      version: alternativa.version,
      status: alternativa.status,
      reason: alternativa.reason,
      optionSummary: alternativa.optionSummary,
      priceDeltaPyg: alternativa.priceDeltaPyg,
      newEta: alternativa.newEta,
      notes: alternativa.notes,
      resumen: resumenAlternativa(alternativa),
      requiereOtp: requiereAprobacionCliente(alternativa.priceDeltaPyg),
      resuelta: ['ACEPTADA', 'RECHAZADA', 'CANCELADA'].includes(alternativa.status),
      aprobadaPorCliente: Boolean(alternativa.customerApprovedAt),
      rechazadaPorCliente: Boolean(alternativa.customerRejectedAt),
    },
    need: {
      product: alternativa.supplyNeed.product?.name || 'Producto',
      sku: alternativa.supplyNeed.product?.sku || null,
      condition: alternativa.supplyNeed.condition,
      quantity: alternativa.supplyNeed.quantity,
      promisedAt: alternativa.supplyNeed.promisedAt,
      customer: alternativa.supplyNeed.customer?.name || null,
      status: alternativa.supplyNeed.status,
    },
    versions: await versionesDe(alternativa.supplyNeedId),
  })
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  try {
    const alternativa = await alternativaPorToken(token)
    if (!alternativa) return error('Propuesta no encontrada.', 404)
    const body = objectInput(await request.json())
    if (Object.keys(body).some((key) => !['decision', 'otp', 'motivo'].includes(key))) throw new InputError('Campo no admitido.')
    const decision = String(body.decision || '').toUpperCase()
    if (!['ACEPTAR', 'RECHAZAR'].includes(decision)) throw new InputError('Decisión inválida.')
    if (alternativa.status !== 'ENVIADA_AL_CLIENTE') throw new InputError('La propuesta ya fue resuelta.', 409)
    const necesitaOtp = requiereAprobacionCliente(alternativa.priceDeltaPyg)
    if (necesitaOtp && decision === 'ACEPTAR') {
      if (!otpVigente(alternativa.otpExpiresAt)) throw new InputError('El código venció: pedí uno nuevo al vendedor.', 409)
      if (!otpValido(String(body.otp || ''), alternativa.otpCodeHash, alternativa.otpAttempts)) {
        await prisma.supplyAlternative.update({ where: { id: alternativa.id }, data: { otpAttempts: { increment: 1 } } })
        throw new InputError(`Código incorrecto. Te quedan ${Math.max(0, OTP_MAX_INTENTOS - (alternativa.otpAttempts + 1))} intentos.`, 400)
      }
    }
    const motivo = body.motivo === undefined || body.motivo === '' ? null : String(body.motivo).slice(0, 500)
    const resultado = await prisma.$transaction(async (tx) => {
      const ahora = new Date()
      const estado = decision === 'ACEPTAR' ? 'ACEPTADA' : 'RECHAZADA'
      await tx.supplyAlternative.update({ where: { id: alternativa.id }, data: { status: estado, ...(estado === 'ACEPTADA' ? { customerApprovedAt: ahora } : { customerRejectedAt: ahora }), notes: motivo ? [alternativa.notes, motivo].filter(Boolean).join('\n') : alternativa.notes } })
      // La necesidad anterior se libera recién al aceptar (o vuelve al panel si rechaza).
      const estadoNecesidad = estadoNecesidadTras(estado)
      await tx.supplyNeed.update({ where: { id: alternativa.supplyNeedId }, data: { status: estadoNecesidad } })
      await tx.auditLog.create({ data: { tenantId: alternativa.tenantId, userId: null, action: estado === 'ACEPTADA' ? 'SUPPLY_ALTERNATIVE_CUSTOMER_APPROVED' : 'SUPPLY_ALTERNATIVE_CUSTOMER_REJECTED', entity: 'SupplyNeed', entityId: alternativa.supplyNeedId, metadata: { alternativaId: alternativa.id, version: alternativa.version, origen: 'cliente', motivo, resumen: resumenAlternativa(alternativa) } } })
      return { estado, estadoNecesidad }
    })
    return json({ ok: true, ...resultado })
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo registrar la respuesta.', cause instanceof InputError ? cause.status : 400)
  }
}
