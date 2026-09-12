import { prisma } from '../../../lib/prisma'
import { requireSession } from '../../../lib/auth'
import { error, json } from '../../../lib/http'
import { FINANCE_CURRENCIES, FinanceInputError, frozenAmountPyg, realMargin } from '../../../lib/finance'

const ROLES = ['ADMIN', 'GERENTE', 'CAJERA'] as const
const WRITE_ROLES = ['ADMIN', 'GERENTE', 'CAJERA'] as const
const KINDS = ['EXPENSE', 'TRANSFER', 'SUPPLIER_ADVANCE', 'CHEQUE', 'OWNER_WITHDRAWAL', 'ADJUSTMENT'] as const

function text(value: unknown, field: string, max = 500, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new FinanceInputError(`${field} es obligatorio.`)
    return null
  }
  if (typeof value !== 'string' || value.trim().length > max) throw new FinanceInputError(`${field} inválido.`)
  return value.trim() || null
}

async function scope(request: Request, write = false) {
  const session = await requireSession(request)
  if (!session) return { status: 401 as const }
  if (!(write ? WRITE_ROLES : ROLES).includes(session.user.role as (typeof ROLES)[number])) return { status: 403 as const }
  const requestedBranch = new URL(request.url).searchParams.get('branchId')
  const branchId = session.user.role === 'ADMIN' ? requestedBranch || null : session.user.branchId
  if (session.user.role !== 'ADMIN' && !branchId) return { status: 403 as const }
  if (branchId) {
    const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId: session.user.tenantId, isActive: true }, select: { id: true } })
    if (!branch) return { status: 403 as const }
  }
  return { session, branchId }
}

export async function GET(request: Request) {
  const ctx = await scope(request)
  if ('status' in ctx) return error(ctx.status === 401 ? 'Falta sesión.' : 'No autorizado.', ctx.status)
  const tenantId = ctx.session.user.tenantId
  const branchFilter = ctx.branchId ? { branchId: ctx.branchId } : {}
  const [movements, accounts, orders, purchases, salePayments, reconciliations] = await Promise.all([
    prisma.cashMovement.findMany({ where: { tenantId, ...branchFilter }, include: { account: { select: { id: true, name: true, currency: true } } }, orderBy: { createdAt: 'desc' }, take: 150 }),
    prisma.paymentAccount.findMany({ where: { tenantId }, select: { id: true, name: true, currency: true, kind: true, feePercent: true, isActive: true } }),
    prisma.order.findMany({ where: { tenantId, ...branchFilter, status: { not: 'CANCELLED' } }, select: { id: true, totalPyg: true, payments: { select: { amountPyg: true, status: true } }, items: { select: { quantity: true, totalPyg: true, unitCostPyg: true, insurancePyg: true, extraCostPyg: true } } }, take: 5000 }),
    prisma.purchaseOrder.findMany({ where: { tenantId, ...branchFilter }, select: { id: true, supplierName: true, shippingPyg: true, customsPyg: true, insurancePyg: true, taxesPyg: true, otherCostsPyg: true, lines: { select: { quantity: true, unitCostPyg: true } }, payments: { select: { amountPyg: true, accountId: true, originalAmount: true } } }, take: 5000 }),
    prisma.payment.findMany({ where: { tenantId, status: 'CONFIRMED', order: branchFilter }, select: { accountId: true, originalAmount: true, amountPyg: true, currency: true } }),
    prisma.paymentReconciliation.findMany({ where: { tenantId, state: 'PENDING' }, select: { id: true, paymentId: true, createdAt: true, payment: { select: { amountPyg: true, currency: true, originalAmount: true, order: { select: { branchId: true, orderNumber: true } } } } }, take: 100 }),
  ])
  const margin = realMargin(orders.flatMap(order => order.items))
  const receivables = orders.map(order => ({ id: order.id, totalPyg: order.totalPyg, paidPyg: order.payments.filter(payment => payment.status === 'CONFIRMED').reduce((total, payment) => total + payment.amountPyg, 0) })).map(row => ({ ...row, pendingPyg: Math.max(0, row.totalPyg - row.paidPyg) })).filter(row => row.pendingPyg > 0)
  const payables = purchases.map(purchase => {
    const totalPyg = purchase.lines.reduce((total, line) => total + line.quantity * line.unitCostPyg, 0) + purchase.shippingPyg + purchase.customsPyg + purchase.insurancePyg + purchase.taxesPyg + purchase.otherCostsPyg
    const paidPyg = purchase.payments.reduce((total, payment) => total + payment.amountPyg, 0)
    return { id: purchase.id, supplierName: purchase.supplierName, totalPyg, paidPyg, pendingPyg: Math.max(0, totalPyg - paidPyg) }
  }).filter(row => row.pendingPyg > 0)
  const balances = new Map(accounts.map(account => [account.id, { ...account, balance: 0 }]))
  for (const movement of movements) if (movement.status === 'CLEARED' && movement.accountId && balances.has(movement.accountId)) balances.get(movement.accountId)!.balance += (movement.direction === 'IN' ? 1 : -1) * Number(movement.originalAmount)
  for (const payment of salePayments) if (payment.accountId && balances.has(payment.accountId)) balances.get(payment.accountId)!.balance += Number(payment.originalAmount ?? payment.amountPyg)
  for (const purchase of purchases) for (const payment of purchase.payments) if (payment.accountId && balances.has(payment.accountId)) balances.get(payment.accountId)!.balance -= Number(payment.originalAmount ?? payment.amountPyg)
  return json({
    movements, accounts: [...balances.values()],
    receivables: { rows: receivables, totalPyg: receivables.reduce((total, row) => total + row.pendingPyg, 0) },
    payables: { rows: payables, totalPyg: payables.reduce((total, row) => total + row.pendingPyg, 0) },
    margin,
    reconciliations: reconciliations.filter(row => !ctx.branchId || row.payment.order.branchId === ctx.branchId),
  })
}

export async function POST(request: Request) {
  const ctx = await scope(request, true)
  if ('status' in ctx) return error(ctx.status === 401 ? 'Falta sesión.' : 'No autorizado.', ctx.status)
  try {
    const body = await request.json() as Record<string, unknown>
    const action = body.action
    if (action === 'movement') {
      const kind = body.kind as string; const direction = body.direction as string; const currency = body.currency as string
      if (!(KINDS as readonly string[]).includes(kind) || !['IN', 'OUT'].includes(direction) || !(FINANCE_CURRENCIES as readonly string[]).includes(currency)) throw new FinanceInputError('Tipo, dirección o moneda inválidos.')
      const originalAmount = String(body.originalAmount ?? ''); const exchangeRatePyg = String(body.exchangeRatePyg ?? (currency === 'PYG' ? 1 : ''))
      const amountPyg = frozenAmountPyg(originalAmount, currency as (typeof FINANCE_CURRENCIES)[number], exchangeRatePyg)
      const description = text(body.description, 'Descripción', 500, true)!
      const accountId = text(body.accountId, 'Cuenta', 200)
      const dueAt = body.dueAt ? new Date(String(body.dueAt)) : null
      if (dueAt && !Number.isFinite(dueAt.getTime())) throw new FinanceInputError('Vencimiento inválido.')
      const movement = await prisma.$transaction(async tx => {
        if (accountId) {
          const account = await tx.paymentAccount.findFirst({ where: { id: accountId, tenantId: ctx.session.user.tenantId, isActive: true }, select: { id: true, currency: true } })
          if (!account || account.currency !== currency) throw new FinanceInputError('La cuenta no corresponde a la moneda.')
        }
        const created = await tx.cashMovement.create({ data: { tenantId: ctx.session.user.tenantId, branchId: ctx.branchId, accountId, createdById: ctx.session.user.id, kind: kind as any, direction: direction as any, currency: currency as any, originalAmount, exchangeRatePyg, amountPyg, counterparty: text(body.counterparty, 'Contraparte', 200), reference: text(body.reference, 'Referencia', 200), description, dueAt, status: kind === 'CHEQUE' ? 'PENDING' : 'CLEARED', clearedAt: kind === 'CHEQUE' ? null : new Date() } })
        await tx.auditLog.create({ data: { tenantId: ctx.session.user.tenantId, userId: ctx.session.user.id, action: 'FINANCE_MOVEMENT_CREATED', entity: 'CashMovement', entityId: created.id, metadata: { kind, direction, currency, originalAmount, exchangeRatePyg, amountPyg } } })
        return created
      })
      return json(movement, { status: 201 })
    }
    if (action === 'clear' || action === 'void') {
      const id = text(body.id, 'Movimiento', 200, true)!
      const result = await prisma.cashMovement.updateMany({ where: { id, tenantId: ctx.session.user.tenantId, ...(ctx.branchId ? { branchId: ctx.branchId } : {}), status: 'PENDING' }, data: action === 'clear' ? { status: 'CLEARED', clearedAt: new Date() } : { status: 'VOID' } })
      if (!result.count) return error('Movimiento pendiente no encontrado.', 404)
      await prisma.auditLog.create({ data: { tenantId: ctx.session.user.tenantId, userId: ctx.session.user.id, action: action === 'clear' ? 'CHEQUE_CLEARED' : 'FINANCE_MOVEMENT_VOIDED', entity: 'CashMovement', entityId: id, metadata: {} } })
      return json({ id, status: action === 'clear' ? 'CLEARED' : 'VOID' })
    }
    throw new FinanceInputError('Acción financiera inválida.')
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo guardar el movimiento.', cause instanceof FinanceInputError || cause instanceof SyntaxError ? 400 : 409) }
}
