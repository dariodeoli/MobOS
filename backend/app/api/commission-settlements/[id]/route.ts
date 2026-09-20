import type { Prisma } from '@prisma/client'
import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../lib/auth'

// Detalle y ciclo de vida de una liquidación de comisiones. El comprobante
// impreso sale de `linesJson`, que quedó congelado al cerrar el período.
//
// Permiso de lectura: reports:read o commissions:settle. Marcar pagada o
// anular exige commissions:settle (mueve dinero) y es de ADMIN/GERENTE.
const READ_PERMISSIONS = ['reports:read', 'commissions:settle'] as const

type SettlementDetail = {
  id: string
  sellerId: string
  periodFrom: string
  periodTo: string
  totalPyg: number
  marginPyg: number
  commissionPct: Prisma.Decimal | null
  linesJson: Prisma.JsonValue
  status: string
  verificationToken: string
  notes: string | null
  createdAt: Date
  paidAt: Date | null
  seller: { id: string; name: string; role: string } | null
  createdBy: { id: string; name: string } | null
  paidBy: { id: string; name: string } | null
}

const DETAIL_SELECT = {
  id: true,
  sellerId: true,
  periodFrom: true,
  periodTo: true,
  totalPyg: true,
  marginPyg: true,
  commissionPct: true,
  linesJson: true,
  status: true,
  verificationToken: true,
  notes: true,
  createdAt: true,
  paidAt: true,
  seller: { select: { id: true, name: true, role: true } },
  createdBy: { select: { id: true, name: true } },
  paidBy: { select: { id: true, name: true } },
} as const

function shape(settlement: SettlementDetail) {
  return {
    id: settlement.id,
    sellerId: settlement.sellerId,
    sellerName: settlement.seller?.name ?? null,
    sellerRole: settlement.seller?.role ?? null,
    periodFrom: settlement.periodFrom,
    periodTo: settlement.periodTo,
    totalPyg: settlement.totalPyg,
    marginPyg: settlement.marginPyg,
    commissionPct: settlement.commissionPct === null ? null : Number(settlement.commissionPct),
    status: settlement.status,
    verificationToken: settlement.verificationToken,
    notes: settlement.notes,
    createdAt: settlement.createdAt,
    paidAt: settlement.paidAt,
    lines: Array.isArray(settlement.linesJson) ? settlement.linesJson : [],
    createdBy: settlement.createdBy ? { id: settlement.createdBy.id, name: settlement.createdBy.name } : null,
    paidBy: settlement.paidBy ? { id: settlement.paidBy.id, name: settlement.paidBy.name } : null,
  }
}

// Falla cuando otra petición cambió el estado antes de aplicar la mutación:
// evita pagar dos veces por un doble clic o dos pestañas.
class EstadoCambiadoError extends Error {}

async function findSettlement(id: string, tenantId: string) {
  return prisma.commissionSettlement.findFirst({ where: { id, tenantId }, select: DETAIL_SELECT })
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, READ_PERMISSIONS)) return error('No autorizado.', 403)
  const { id } = await context.params
  const settlement = await findSettlement(String(id || '').trim(), session.user.tenantId)
  if (!settlement) return error('Liquidación no encontrada.', 404)
  return json(shape(settlement))
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['commissions:settle'])) return error('No autorizado.', 403)
  const { id: rawId } = await context.params
  const id = String(rawId || '').trim()
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const action = typeof body?.action === 'string' ? body.action.trim().toLowerCase() : ''
  if (action !== 'pay' && action !== 'cancel') return error('Acción inválida.')
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 240) : ''

  const existing = await prisma.commissionSettlement.findFirst({ where: { id, tenantId: session.user.tenantId }, select: { id: true, status: true, sellerId: true, totalPyg: true } })
  if (!existing) return error('Liquidación no encontrada.', 404)
  if (existing.status !== 'DRAFT') return error(action === 'pay' ? 'La liquidación ya no está en borrador.' : 'Solo se puede anular una liquidación en borrador.', 409)

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // El guard de estado va en el WHERE: dos pagos simultáneos solo aplican uno.
      const applied = await tx.commissionSettlement.updateMany({
        where: { id, tenantId: session.user.tenantId, status: 'DRAFT' },
        data: action === 'pay'
          ? { status: 'PAID', paidAt: new Date(), paidById: session.user.id }
          : { status: 'CANCELLED' },
      })
      if (applied.count === 0) throw new EstadoCambiadoError()
      const settlement = await tx.commissionSettlement.findFirstOrThrow({ where: { id, tenantId: session.user.tenantId }, select: DETAIL_SELECT })
      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: session.user.id,
          action: action === 'pay' ? 'COMMISSION_SETTLEMENT_PAID' : 'COMMISSION_SETTLEMENT_CANCELLED',
          entity: 'CommissionSettlement',
          entityId: id,
          metadata: { sellerId: existing.sellerId, totalPyg: existing.totalPyg, ...(reason ? { reason } : {}) },
        },
      })
      return settlement
    })
    return json(shape(updated))
  } catch (cause) {
    if (cause instanceof EstadoCambiadoError) return error(action === 'pay' ? 'La liquidación ya no está en borrador.' : 'Solo se puede anular una liquidación en borrador.', 409)
    return error('No se pudo actualizar la liquidación.', 500)
  }
}
