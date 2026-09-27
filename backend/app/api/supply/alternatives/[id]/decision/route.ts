import { prisma } from '../../../../../../lib/prisma'
import { error, json, tenantId } from '../../../../../../lib/http'
import { requireSession } from '../../../../../../lib/auth'
import { InputError, objectInput, textInput } from '../../../../../../lib/payment-input'
import { estadoNecesidadTras, generarCodigoOtp, generarTokenPublico, hashToken, huellaOtp, requiereAprobacionCliente, resumenAlternativa, vigenciaOtp } from '../../../../../../lib/supply-alternatives'

// A5 (#279) · El **vendedor resuelve** la alternativa propuesta: aceptar,
// mantener y esperar, cancelar el producto o enviar las opciones al cliente.
// Solo ENVIAR_CLIENTE (o un cambio de precio) exige aprobación del cliente.
const DECISIONES = ['ACEPTAR', 'MANTENER', 'CANCELAR', 'ENVIAR_CLIENTE']

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  try {
    const { id } = await context.params
    const body = objectInput(await request.json())
    if (Object.keys(body).some((key) => !['decision', 'motivo'].includes(key))) throw new InputError('Campo no admitido.')
    const decision = textInput(body.decision, 'Decisión', 40).toUpperCase()
    if (!DECISIONES.includes(decision)) throw new InputError('Decisión inválida.')
    const motivo = body.motivo === undefined || body.motivo === '' ? null : textInput(body.motivo, 'Motivo', 500)
    const alternativa = await prisma.supplyAlternative.findFirst({ where: { id: id.slice(0, 128), tenantId: tenant }, include: { supplyNeed: { select: { id: true } } } })
    if (!alternativa) return error('Alternativa no encontrada.', 404)
    if (['ACEPTADA', 'CANCELADA'].includes(alternativa.status)) throw new InputError('La alternativa ya está resuelta.', 409)
    const necesitaCliente = requiereAprobacionCliente(alternativa.priceDeltaPyg)
    if (decision === 'ACEPTAR' && necesitaCliente) throw new InputError('La diferencia de precio necesita la aprobación del cliente.', 409)
    const resultado = await prisma.$transaction(async (tx) => {
      const ahora = new Date()
      if (decision === 'ENVIAR_CLIENTE') {
        const token = generarTokenPublico()
        const otp = necesitaCliente ? generarCodigoOtp() : null
        const expira = otp ? vigenciaOtp(ahora) : null
        await tx.supplyAlternative.update({ where: { id: alternativa.id }, data: { status: 'ENVIADA_AL_CLIENTE', publicTokenHash: hashToken(token), ...(otp ? { otpCodeHash: huellaOtp(otp), otpExpiresAt: expira, otpAttempts: 0 } : {}), notes: motivo ? [alternativa.notes, motivo].filter(Boolean).join('\n') : alternativa.notes } })
        await tx.supplyNeed.update({ where: { id: alternativa.supplyNeed.id }, data: { status: 'ESPERANDO_CLIENTE' } })
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'SUPPLY_ALTERNATIVE_SENT', entity: 'SupplyNeed', entityId: alternativa.supplyNeed.id, metadata: { alternativaId: alternativa.id, version: alternativa.version, priceDeltaPyg: alternativa.priceDeltaPyg, requiereOtp: necesitaCliente, resumen: resumenAlternativa(alternativa) } } })
        return { estado: 'ENVIADA_AL_CLIENTE', link: `/alternativa/${token}`, otp, otpExpiresAt: expira }
      }
      const estado = decision === 'ACEPTAR' ? 'ACEPTADA' : decision === 'CANCELAR' ? 'CANCELADA' : 'RECHAZADA'
      await tx.supplyAlternative.update({ where: { id: alternativa.id }, data: { status: estado, decidedById: session.user.id, decidedAt: ahora, ...(estado === 'ACEPTADA' ? { customerApprovedAt: ahora } : {}), notes: motivo ? [alternativa.notes, motivo].filter(Boolean).join('\n') : alternativa.notes } })
      const estadoNecesidad = estadoNecesidadTras(estado)
      if (estadoNecesidad !== 'ESPERANDO_CLIENTE') await tx.supplyNeed.update({ where: { id: alternativa.supplyNeed.id }, data: { status: estadoNecesidad } })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: estado === 'ACEPTADA' ? 'SUPPLY_ALTERNATIVE_ACCEPTED' : estado === 'CANCELADA' ? 'SUPPLY_ALTERNATIVE_CANCELLED' : 'SUPPLY_ALTERNATIVE_KEPT', entity: 'SupplyNeed', entityId: alternativa.supplyNeed.id, metadata: { alternativaId: alternativa.id, version: alternativa.version, motivo } } })
      return { estado, estadoNecesidad }
    })
    return json({ ok: true, alternative: { id: alternativa.id, version: alternativa.version }, ...resultado })
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo resolver la alternativa.', cause instanceof InputError ? cause.status : 409)
  }
}
