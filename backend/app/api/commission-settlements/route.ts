import type { Prisma } from '@prisma/client'
import { randomBytes } from 'node:crypto'
import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { canAccessAny, hashToken, requireSession } from '../../../lib/auth'
import {
  MAX_REPORT_ORDERS,
  ReportInputError,
  aggregateCommissions,
  dayBounds,
  localDayKey,
  parseReportQuery,
  type CommissionRuleLike,
  type OrderLike,
} from '../../../lib/reporting'

// Liquidaciones de comisiones por vendedor: cerrar un período, congelar el
// detalle por venta y emitir el comprobante con token de verificación. El
// cálculo reutiliza el reporte de comisiones (`aggregateCommissions`): la
// liquidación cobra exactamente lo que muestra Reportes → Comisiones.
//
// Permiso: reports:read o payments:manage, siempre dentro de la empresa.
const PERMISSIONS = ['reports:read', 'payments:manage'] as const
const MAX_SETTLEMENTS = 200
const STATUSES = ['DRAFT', 'PAID', 'CANCELLED'] as const

const text = (value: unknown, max = 128) => typeof value === 'string' ? value.trim().slice(0, max) : ''

// Token de verificación del comprobante: 64 hex (docs/TOKENS.md). Solo se
// persiste su sha256; el crudo viaja una vez al emitirlo y no se loguea.
const nuevoTokenVerificacion = () => randomBytes(32).toString('hex')

type SettlementView = {
  id: string
  sellerId: string
  periodFrom: string
  periodTo: string
  totalPyg: number
  marginPyg: number
  commissionPct: Prisma.Decimal | null
  status: string
  verificationTokenHash: string | null
  verificationTokenIssuedAt: Date | null
  notes: string | null
  createdAt: Date
  paidAt: Date | null
  seller: { id: string; name: string } | null
  createdBy: { id: string; name: string } | null
}

function shape(settlement: SettlementView) {
  return {
    id: settlement.id,
    sellerId: settlement.sellerId,
    sellerName: settlement.seller?.name ?? null,
    periodFrom: settlement.periodFrom,
    periodTo: settlement.periodTo,
    totalPyg: settlement.totalPyg,
    marginPyg: settlement.marginPyg,
    commissionPct: settlement.commissionPct === null ? null : Number(settlement.commissionPct),
    status: settlement.status,
    // El token crudo no se devuelve nunca desde la base: se revela una vez al
    // emitir o rotar. El panel usa `hasVerificationToken` para pedir uno nuevo.
    hasVerificationToken: Boolean(settlement.verificationTokenHash),
    verificationTokenIssuedAt: settlement.verificationTokenIssuedAt,
    notes: settlement.notes,
    createdAt: settlement.createdAt,
    paidAt: settlement.paidAt,
    createdBy: settlement.createdBy ? { id: settlement.createdBy.id, name: settlement.createdBy.name } : null,
  }
}

const SETTLEMENT_SELECT = {
  id: true,
  sellerId: true,
  periodFrom: true,
  periodTo: true,
  totalPyg: true,
  marginPyg: true,
  commissionPct: true,
  status: true,
  verificationTokenHash: true,
  verificationTokenIssuedAt: true,
  notes: true,
  createdAt: true,
  paidAt: true,
  seller: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} as const

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, PERMISSIONS)) return error('No autorizado.', 403)

  const url = new URL(request.url)
  const sellerId = text(url.searchParams.get('sellerId'))
  const status = text(url.searchParams.get('status')).toUpperCase()
  if (status && !(STATUSES as readonly string[]).includes(status)) return error('Estado inválido.')
  const takeRaw = Number(url.searchParams.get('take') || 100)
  const take = Number.isSafeInteger(takeRaw) && takeRaw > 0 ? Math.min(takeRaw, MAX_SETTLEMENTS) : 100

  const settlements = await prisma.commissionSettlement.findMany({
    where: { tenantId: session.user.tenantId, ...(sellerId ? { sellerId } : {}), ...(status ? { status } : {}) },
    select: SETTLEMENT_SELECT,
    orderBy: { createdAt: 'desc' },
    take,
  })
  return json(settlements.map(shape))
}

export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, PERMISSIONS)) return error('No autorizado.', 403)

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const sellerId = text(body?.sellerId)
  if (!sellerId) return error('Vendedor obligatorio.')
  const from = text(body?.from, 10)
  const to = text(body?.to, 10)
  if (!from || !to) return error('Indicá el período: desde y hasta.')
  const parsed = parseReportQuery(new URLSearchParams({ from, to }))
  if (!parsed.ok) return error(parsed.error)
  const { from: periodFrom, to: periodTo, offsetMinutes } = parsed.value
  const tenantId = session.user.tenantId

  const seller = await prisma.user.findFirst({ where: { id: sellerId, tenantId }, select: { id: true, name: true, role: true } })
  if (!seller) return error('Vendedor no encontrado.', 404)

  // Una liquidación vigente por vendedor y período (se rechaza cualquier
  // superposición): evita pagar dos veces el mismo tramo. Una anulada se puede
  // volver a liquidar.
  const existing = await prisma.commissionSettlement.findFirst({
    where: { tenantId, sellerId, status: { in: ['DRAFT', 'PAID'] }, periodFrom: { lte: periodTo }, periodTo: { gte: periodFrom } },
    select: { id: true, periodFrom: true, periodTo: true },
  })
  if (existing) return error(`Ya existe una liquidación de ese vendedor que se superpone (${existing.periodFrom} al ${existing.periodTo}).`, 409)

  try {
    const { start, end } = dayBounds(periodFrom, periodTo, offsetMinutes)
    const token = nuevoTokenVerificacion()
    const orders = await prisma.order.findMany({
      where: { tenantId, sellerId, createdAt: { gte: start, lt: end } },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        subtotalPyg: true,
        discountPyg: true,
        totalPyg: true,
        sellerId: true,
        createdAt: true,
        items: { select: { productId: true, description: true, quantity: true, unitCostPyg: true, totalPyg: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_REPORT_ORDERS + 1,
    })
    if (orders.length > MAX_REPORT_ORDERS) return error('El período supera el tope de ventas analizadas; acotá el rango.', 409)

    const rules = await prisma.commissionRule.findMany({
      where: { tenantId },
      select: { userId: true, role: true, percentPyg: true },
    })
    const ruleLikes: CommissionRuleLike[] = rules.map((rule) => ({
      userId: rule.userId,
      role: rule.role,
      percentPyg: rule.percentPyg === null ? null : Number(rule.percentPyg),
    }))
    const sellers = { [seller.id]: { name: seller.name, role: seller.role } }
    const ordersLike: OrderLike[] = orders.map((order) => ({
      id: order.id,
      status: order.status,
      subtotalPyg: order.subtotalPyg,
      discountPyg: order.discountPyg,
      totalPyg: order.totalPyg,
      sellerId: order.sellerId,
      sellerName: seller.name,
      createdAt: order.createdAt,
      items: order.items.map((item) => ({
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        unitCostPyg: item.unitCostPyg,
        totalPyg: item.totalPyg,
      })),
    }))

    const commissions = aggregateCommissions(ordersLike, ruleLikes, sellers)
    const row = commissions.sellers.find((sellerRow) => sellerRow.sellerId === seller.id)
    if (!row || row.orders === 0) return error('El vendedor no tiene ventas en el período.', 409)
    if (row.commissionPct === null) return error('El vendedor no tiene una regla de comisión vigente.', 409)

    // Detalle congelado por venta. Se calcula con la MISMA función del reporte
    // (una orden por vez) para no duplicar la regla de margen ni el porcentaje.
    const lines = ordersLike
      .map((order, index) => ({ order, orderNumber: orders[index]?.orderNumber ?? '' }))
      .filter(({ order }) => order.status !== 'CANCELLED')
      .map(({ order, orderNumber }) => {
        const single = aggregateCommissions([order], ruleLikes, sellers).sellers[0]
        return {
          orderNumber,
          date: localDayKey(order.createdAt, offsetMinutes),
          totalPyg: order.totalPyg,
          basePyg: single?.marginPyg ?? 0,
          commissionPct: single?.commissionPct ?? row.commissionPct,
          commissionPyg: single?.commissionPyg ?? 0,
        }
      })
    // El total sale del reporte (redondeo sobre el margen acumulado); si la
    // suma de las líneas no coincide por redondeo, la diferencia se explicita.
    const lineTotal = lines.reduce((sum, line) => sum + line.commissionPyg, 0)
    const adjustment = row.commissionPyg - lineTotal
    if (adjustment !== 0) {
      lines.push({ orderNumber: 'Ajuste por redondeo', date: periodTo, totalPyg: 0, basePyg: 0, commissionPct: row.commissionPct, commissionPyg: adjustment })
    }

    const created = await prisma.$transaction(async (tx) => {
      const settlement = await tx.commissionSettlement.create({
        data: {
          tenantId,
          sellerId: seller.id,
          periodFrom,
          periodTo,
          totalPyg: row.commissionPyg,
          marginPyg: row.marginPyg,
          commissionPct: row.commissionPct,
          linesJson: lines as unknown as Prisma.InputJsonValue,
          verificationTokenHash: hashToken(token),
          verificationTokenIssuedAt: new Date(),
          createdById: session.user.id,
        },
        select: SETTLEMENT_SELECT,
      })
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: session.user.id,
          action: 'COMMISSION_SETTLED',
          entity: 'CommissionSettlement',
          entityId: settlement.id,
          metadata: { sellerId: seller.id, sellerName: seller.name, periodFrom, periodTo, totalPyg: row.commissionPyg, orders: row.orders },
        },
      })
      return settlement
    })
    return json({ ...shape(created), verificationToken: token }, { status: 201 })
  } catch (cause) {
    if (cause instanceof ReportInputError) return error(cause.message)
    return error('No se pudo cerrar la liquidación.', 500)
  }
}
