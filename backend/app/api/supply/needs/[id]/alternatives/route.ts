import { prisma } from '../../../../../../lib/prisma'
import { error, json, tenantId } from '../../../../../../lib/http'
import { requireSession } from '../../../../../../lib/auth'
import { InputError, objectInput, textInput } from '../../../../../../lib/payment-input'

// A5 (#279) · Variante agotada: el **comprador propone** alternativas (no
// decide). Cada propuesta es una versión nueva; la necesidad pasa a
// ESPERANDO_CLIENTE y el vendedor resuelve desde /alternatives/[id]/decision.
// Una necesidad ya cubierta o cerrada no admite propuestas nuevas.
const CERRADAS = ['CANCELADA', 'RECIBIDA', 'COMPRADA']

const versiones = (supplyNeedId: string) => prisma.supplyAlternative.findMany({
  where: { supplyNeedId },
  orderBy: { version: 'asc' },
  select: { id: true, version: true, status: true, reason: true, optionSummary: true, productId: true, priceDeltaPyg: true, newEta: true, notes: true, proposedById: true, decidedById: true, decidedAt: true, customerApprovedAt: true, customerRejectedAt: true, createdAt: true },
})

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const { id } = await context.params
  const necesidad = await prisma.supplyNeed.findFirst({ where: { id: id.slice(0, 128), tenantId: tenant }, select: { id: true, status: true } })
  if (!necesidad) return error('Necesidad no encontrada.', 404)
  return json({ need: necesidad, alternatives: await versiones(necesidad.id) })
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  try {
    const { id } = await context.params
    const necesidad = await prisma.supplyNeed.findFirst({ where: { id: id.slice(0, 128), tenantId: tenant }, select: { id: true, status: true, productId: true } })
    if (!necesidad) return error('Necesidad no encontrada.', 404)
    if (CERRADAS.includes(necesidad.status)) throw new InputError('La necesidad ya está cerrada.', 409)
    const body = objectInput(await request.json())
    if (Object.keys(body).some((key) => !['reason', 'optionSummary', 'productId', 'priceDeltaPyg', 'newEta', 'notes'].includes(key))) throw new InputError('Campo no admitido.')
    const optionSummary = textInput(body.optionSummary, 'Opción', 300)
    const reason = body.reason === undefined || body.reason === '' ? null : textInput(body.reason, 'Motivo', 300)
    const notes = body.notes === undefined || body.notes === '' ? null : textInput(body.notes, 'Observación', 1000)
    const productId = body.productId === undefined || body.productId === '' ? null : textInput(body.productId, 'productId', 200)
    if (productId) {
      const producto = await prisma.product.findFirst({ where: { id: productId, tenantId: tenant }, select: { id: true } })
      if (!producto) throw new InputError('Producto no encontrado.')
    }
    const priceDeltaPyg = body.priceDeltaPyg === undefined || body.priceDeltaPyg === '' || body.priceDeltaPyg === null ? 0 : Number(body.priceDeltaPyg)
    if (!Number.isSafeInteger(priceDeltaPyg)) throw new InputError('La diferencia de precio tiene que ser un entero en Gs.')
    const newEta = body.newEta === undefined || body.newEta === '' || body.newEta === null ? null : new Date(String(body.newEta))
    if (newEta && Number.isNaN(newEta.getTime())) throw new InputError('La nueva fecha no es válida.')
    const creada = await prisma.$transaction(async (tx) => {
      const ultima = await tx.supplyAlternative.aggregate({ where: { supplyNeedId: necesidad.id }, _max: { version: true } })
      const version = Number(ultima._max.version || 0) + 1
      // La versión original queda intacta: cada propuesta es una fila nueva.
      const alternativa = await tx.supplyAlternative.create({ data: { tenantId: tenant, supplyNeedId: necesidad.id, version, status: 'PROPUESTA', reason, optionSummary, productId, priceDeltaPyg, newEta, notes, proposedById: session.user.id } })
      await tx.supplyNeed.update({ where: { id: necesidad.id }, data: { status: 'ESPERANDO_CLIENTE' } })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'SUPPLY_ALTERNATIVE_PROPOSED', entity: 'SupplyNeed', entityId: necesidad.id, metadata: { alternativaId: alternativa.id, version, optionSummary, priceDeltaPyg, newEta: newEta ? newEta.toISOString() : null } } })
      return alternativa
    })
    return json({ alternative: creada }, { status: 201 })
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo proponer la alternativa.', cause instanceof InputError ? cause.status : 400)
  }
}
