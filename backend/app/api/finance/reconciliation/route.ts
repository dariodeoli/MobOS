import { Prisma, type PaymentMethod } from '@prisma/client'
import { prisma } from '../../../../lib/prisma'
import { requireSession } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { ensureStoreBranch } from '../../../../lib/store-branch'
import { InputError, INT_MAX, objectInput } from '../../../../lib/payment-input'
import { normalizeReconciliationNote } from '../../payments/_lib'
import {
  METHOD_LABELS,
  RECONCILIATION_METHODS,
  accountLabelOf,
  bankOf,
  confirmReconciledPayment,
  holderOf,
  processorOf,
  summarizeReconciliation,
  type ReconciliationBatchLike,
  type ReconciliationPayment,
} from '../../../../lib/reconciliation'

// Conciliación por cuenta, medio y procesadora (#144): ingresos del período,
// lotes recibidos contra lo esperado, diferencias y trazabilidad pago → pedido.
// El detalle de cada pago vive acá; la marca individual sigue en
// /api/payments/:id/reconciliation.

const ROLES = ['ADMIN', 'GERENTE', 'CAJERA'] as const
const MAX_DIAS = 366
const MAX_PAGOS = 5000
const MAX_ITEMS = 1000
const MAX_LOTE = 200
const OFFSET = '-04:00'

const diaParaguay = (fecha: Date) => new Date(fecha.getTime() - 4 * 3_600_000).toISOString().slice(0, 10)

function rangoDe(params: URLSearchParams) {
  const to = params.get('to') || diaParaguay(new Date())
  const from = params.get('from') || diaParaguay(new Date(new Date(`${to}T12:00:00${OFFSET}`).getTime() - 29 * 86_400_000))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new InputError('Indicá el rango con desde y hasta (YYYY-MM-DD).')
  const start = new Date(`${from}T00:00:00${OFFSET}`)
  const end = new Date(`${to}T00:00:00${OFFSET}`)
  end.setDate(end.getDate() + 1)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) throw new InputError('El rango de fechas es inválido.')
  if (end.getTime() - start.getTime() > MAX_DIAS * 86_400_000) throw new InputError(`El rango no puede superar ${MAX_DIAS} días.`)
  return { from, to, start, end }
}

async function scope(request: Request) {
  const session = await requireSession(request)
  if (!session) return { status: 401 as const }
  if (!ROLES.includes(session.user.role as (typeof ROLES)[number])) return { status: 403 as const }
  const requestedBranch = new URL(request.url).searchParams.get('branchId')
  let branchId: string | null = session.user.role === 'ADMIN' ? requestedBranch || null : session.user.branchId
  if (session.user.role !== 'ADMIN' && !branchId) branchId = await ensureStoreBranch(session)
  if (session.user.role !== 'ADMIN' && !branchId) return { status: 403 as const }
  if (branchId) {
    const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId: session.user.tenantId, isActive: true }, select: { id: true } })
    if (!branch) return { status: 403 as const }
  }
  return { session, branchId }
}

function entero(value: unknown, field: string, { required = false, max = INT_MAX }: { required?: boolean; max?: number } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new InputError(`${field} es obligatorio.`)
    return null
  }
  const parsed = typeof value === 'number' ? value : Number(String(value))
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > max) throw new InputError(`${field} debe ser un entero entre 0 y ${max}.`)
  return parsed
}

export async function GET(request: Request) {
  const ctx = await scope(request)
  if ('status' in ctx) return error(ctx.status === 401 ? 'Falta sesión.' : 'No autorizado.', ctx.status)
  try {
    const params = new URL(request.url).searchParams
    const { from, to, start, end } = rangoDe(params)
    const soloResumen = ['1', 'true'].includes((params.get('soloResumen') || '').toLowerCase())
    const accountId = params.get('accountId') || ''
    const method = params.get('method') || ''
    const processor = (params.get('processor') || '').trim()
    const tenantId = ctx.session.user.tenantId

    const [pagos, lotes] = await Promise.all([
      prisma.payment.findMany({
        where: {
          tenantId,
          method: { in: [...RECONCILIATION_METHODS] as PaymentMethod[] },
          status: { in: ['CONFIRMED', 'PENDING', 'REFUNDED'] },
          ...(accountId ? { accountId } : {}),
          ...(method ? { method: method as PaymentMethod } : {}),
          ...(ctx.branchId ? { order: { branchId: ctx.branchId } } : {}),
          paidAt: { gte: start, lt: end },
        },
        select: {
          id: true, paidAt: true, createdAt: true, method: true, status: true, amountPyg: true, currency: true,
          originalAmount: true, reference: true, accountId: true, accountSnapshot: true, settlesAt: true,
          account: { select: { id: true, name: true, kind: true, bank: true, holder: true, processor: true } },
          order: { select: { id: true, orderNumber: true, branchId: true, customer: { select: { name: true } }, seller: { select: { name: true } } } },
          reconciliation: { select: { state: true, note: true, batchId: true, updatedAt: true, verifiedBy: { select: { name: true } } } },
        },
        orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
        take: MAX_PAGOS,
      }),
      prisma.reconciliationBatch.findMany({
        where: { tenantId, ...(ctx.branchId ? { branchId: ctx.branchId } : {}), ...(accountId ? { accountId } : {}), from: { lt: end }, to: { gte: start } },
        include: {
          account: { select: { id: true, name: true, kind: true, processor: true } },
          createdBy: { select: { name: true } },
          _count: { select: { reconciliations: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ])

    const filtrados = processor ? pagos.filter((pago) => processorOf(pago as ReconciliationPayment) === processor) : pagos
    const batches: ReconciliationBatchLike[] = lotes.map((lote) => ({
      accountId: lote.accountId,
      accountKind: lote.account?.kind || null,
      processor: lote.account?.processor || null,
      differencePyg: lote.differencePyg,
      state: lote.state,
    }))
    const resumen = summarizeReconciliation(filtrados as ReconciliationPayment[], batches)

    const items = soloResumen ? [] : filtrados.slice(0, MAX_ITEMS).map((pago) => {
      const estado = pago.reconciliation?.state || 'PENDING'
      return {
        id: pago.id,
        fecha: pago.paidAt || pago.createdAt,
        method: pago.method,
        metodo: METHOD_LABELS[pago.method] || pago.method,
        status: pago.status,
        orderId: pago.order?.id || null,
        orderNumber: pago.order?.orderNumber || '',
        cliente: pago.order?.customer?.name || '',
        vendedor: pago.order?.seller?.name || '',
        accountId: pago.accountId,
        cuenta: accountLabelOf(pago as ReconciliationPayment),
        titular: holderOf(pago as ReconciliationPayment),
        banco: bankOf(pago as ReconciliationPayment),
        procesadora: processorOf(pago as ReconciliationPayment),
        currency: pago.currency,
        originalAmount: pago.originalAmount === null || pago.originalAmount === undefined ? null : Number(pago.originalAmount),
        montoPyg: pago.amountPyg,
        reference: pago.reference || '',
        settlesAt: pago.settlesAt,
        conciliacion: {
          state: estado,
          note: pago.reconciliation?.note || '',
          batchId: pago.reconciliation?.batchId || null,
          verificadoPor: pago.reconciliation?.verifiedBy?.name || '',
          verificadoAt: pago.reconciliation?.updatedAt || null,
        },
      }
    })

    return json({
      rango: { from, to, branchId: ctx.branchId },
      resumen: { ...resumen.totals, lotes: lotes.length, porConciliar: resumen.totals.unverifiedPyg },
      porCuenta: resumen.byAccount,
      porMedio: resumen.byMethod,
      porProcesadora: resumen.byProcessor,
      ...(soloResumen ? {} : {
        items,
        lotes: lotes.map((lote) => ({
          id: lote.id, createdAt: lote.createdAt, from: lote.from, to: lote.to,
          accountId: lote.accountId, cuenta: lote.account?.name || 'Sin cuenta', procesadora: lote.account?.processor || '',
          expectedPyg: lote.expectedPyg, receivedPyg: lote.receivedPyg, differencePyg: lote.differencePyg,
          state: lote.state, estado: lote.state === 'REJECTED' ? 'REJECTED' : lote.differencePyg ? 'DIFFERENCE' : 'VERIFIED',
          note: lote.note || '', creadoPor: lote.createdBy?.name || '', pagos: lote._count.reconciliations,
        })),
      }),
      truncado: pagos.length >= MAX_PAGOS || filtrados.length > MAX_ITEMS,
    })
  } catch (e) {
    return error(e instanceof Error ? e.message : 'No se pudo cargar la conciliación.', e instanceof InputError ? e.status : 400)
  }
}

export async function POST(request: Request) {
  const ctx = await scope(request)
  if ('status' in ctx) return error(ctx.status === 401 ? 'Falta sesión.' : 'No autorizado.', ctx.status)
  try {
    const body = objectInput(await request.json())
    if (body.action !== 'batch') throw new InputError('Acción de conciliación inválida.')
    const rawIds = body.paymentIds
    if (!Array.isArray(rawIds) || !rawIds.length || rawIds.length > MAX_LOTE) throw new InputError(`Elegí entre 1 y ${MAX_LOTE} pagos para el lote.`)
    const paymentIds = [...new Set(rawIds.map((id) => (typeof id === 'string' ? id.trim() : '')))]
    if (paymentIds.some((id) => !id || id.length > 200) || paymentIds.length !== rawIds.length) throw new InputError('La lista de pagos tiene identificadores inválidos o repetidos.')
    let note: string | null
    try { note = normalizeReconciliationNote(body.note) } catch (cause) { throw new InputError(cause instanceof Error ? cause.message : 'note inválida.') }
    const accountIdInput = typeof body.accountId === 'string' && body.accountId.trim() ? body.accountId.trim() : null
    const tenantId = ctx.session.user.tenantId

    const lote = await prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{
        id: string; orderId: string; status: string; amountPyg: number; method: string; accountId: string | null
        paidAt: Date | null; createdAt: Date; deliveryUserId: string | null; deliverySettlementId: string | null
      }>>`
        SELECT "id", "orderId", "status"::text AS "status", "amountPyg", "method"::text AS "method", "accountId", "paidAt", "createdAt", "deliveryUserId", "deliverySettlementId"
        FROM "Payment" WHERE "id" IN (${Prisma.join(paymentIds)}) AND "tenantId" = ${tenantId} FOR UPDATE`
      if (rows.length !== paymentIds.length) throw new InputError('Algún pago del lote no existe en la empresa.', 404)
      for (const row of rows) {
        if (!['CONFIRMED', 'PENDING'].includes(row.status)) throw new InputError('Solo se concilian pagos confirmados o pendientes.')
        if (!(RECONCILIATION_METHODS as readonly string[]).includes(row.method)) throw new InputError('El lote incluye un medio que no se concilia.')
      }
      const cuentas = new Set(rows.map((row) => row.accountId || ''))
      if (cuentas.size > 1) throw new InputError('Los pagos del lote deben pertenecer a la misma cuenta.')
      const accountId = [...cuentas][0] || null
      if (accountIdInput && accountIdInput !== accountId) throw new InputError('La cuenta del lote no coincide con la de los pagos.')

      const expectedPyg = rows.reduce((total, row) => total + row.amountPyg, 0)
      const receivedPyg = entero(body.receivedPyg, 'receivedPyg', { max: INT_MAX }) ?? expectedPyg
      const differencePyg = receivedPyg - expectedPyg
      if (differencePyg !== 0 && !note) throw new InputError('Una diferencia entre lo recibido y lo esperado necesita una observación.')

      const fechas = rows.map((row) => row.paidAt || row.createdAt).sort((a, b) => a.getTime() - b.getTime())
      const orders = await tx.order.findMany({ where: { id: { in: [...new Set(rows.map((row) => row.orderId))] }, tenantId }, select: { id: true, branchId: true } })
      const branches = new Set(orders.map((order) => order.branchId || ''))
      const branchId = branches.size === 1 ? ([...branches][0] || null) : null

      const created = await tx.reconciliationBatch.create({
        data: { tenantId, branchId, accountId, from: fechas[0], to: fechas[fechas.length - 1], expectedPyg, receivedPyg, differencePyg, state: 'VERIFIED', note, createdById: ctx.session.user.id },
      })
      for (const row of rows) {
        await tx.paymentReconciliation.upsert({
          where: { paymentId: row.id },
          create: { tenantId, paymentId: row.id, state: 'VERIFIED', note, verifiedById: ctx.session.user.id, batchId: created.id },
          update: { state: 'VERIFIED', note, verifiedById: ctx.session.user.id, batchId: created.id },
        })
        await confirmReconciledPayment(tx, { tenantId, userId: ctx.session.user.id, row, state: 'VERIFIED', note })
        await tx.auditLog.create({ data: { tenantId, userId: ctx.session.user.id, action: 'PAYMENT_RECONCILIATION_UPDATED', entity: 'PaymentReconciliation', entityId: `${created.id}:${row.id}`, metadata: { paymentId: row.id, state: 'VERIFIED', note, batchId: created.id } } })
      }
      await tx.auditLog.create({ data: { tenantId, userId: ctx.session.user.id, action: 'RECONCILIATION_BATCH_CREATED', entity: 'ReconciliationBatch', entityId: created.id, metadata: { accountId, expectedPyg, receivedPyg, differencePyg, payments: rows.length, note } } })
      return created
    })

    return json({ lote: { ...lote, pagos: paymentIds.length }, conciliados: paymentIds.length }, { status: 201 })
  } catch (e) {
    return error(e instanceof Error ? e.message : 'No se pudo conciliar el lote.', e instanceof InputError ? e.status : e instanceof SyntaxError ? 400 : 409)
  }
}
