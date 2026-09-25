import { Prisma, type CashDirection, type CashMovementKind, type PaymentCurrency } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { requireSession } from '../../../lib/auth'
import { error, json } from '../../../lib/http'
import { InputError } from '../../../lib/payment-input'
import { ensureStoreBranch } from '../../../lib/store-branch'
import { FINANCE_CURRENCIES, FinanceInputError, frozenAmountPyg, purchasePayable } from '../../../lib/finance'
import { CONDICION_PROVEEDOR_LABELS, SUPPLIER_PAYABLE_CONDITIONS, SupplierPayableInputError, enDepositoDeCompra, estadoDeVencimiento, pendienteDeCompra, payableDeCompra } from '../../../lib/supplier-payables'
import { createCashMovement } from '../../../lib/cash-movements'
import { DEFAULT_EXPENSE_LIMIT_PYG, authorizedAmountOf, consumeAuthorization, usableAuthorization } from '../../../lib/authorizations'

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
  let branchId: string | null = session.user.role === 'ADMIN' ? requestedBranch || null : session.user.branchId
  if (session.user.role !== 'ADMIN' && !branchId) branchId = await ensureStoreBranch(session)
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
  const [movements, accounts, orders, purchases, salePayments, reconciliations, supplierPayablesRows] = await Promise.all([
    prisma.cashMovement.findMany({ where: { tenantId, ...branchFilter }, include: { account: { select: { id: true, name: true, currency: true } } }, orderBy: { createdAt: 'desc' }, take: 150 }),
    prisma.paymentAccount.findMany({ where: { tenantId }, select: { id: true, name: true, currency: true, kind: true, feePercent: true, isActive: true } }),
    prisma.order.findMany({ where: { tenantId, ...branchFilter, status: { not: 'CANCELLED' } }, select: { id: true, totalPyg: true, discountPyg: true, payments: { select: { amountPyg: true, status: true } }, items: { select: { quantity: true, totalPyg: true, unitCostPyg: true, insurancePyg: true, extraCostPyg: true } } }, take: 5000 }),
    prisma.purchaseOrder.findMany({ where: { tenantId, ...branchFilter }, select: { id: true, supplierName: true, lines: { select: { quantity: true, unitCostPyg: true, finalTotalCostPyg: true } }, payments: { select: { amountPyg: true, accountId: true, originalAmount: true } } }, take: 5000 }),
    prisma.payment.findMany({ where: { tenantId, status: 'CONFIRMED', order: branchFilter }, select: { accountId: true, originalAmount: true, amountPyg: true, currency: true } }),
    prisma.paymentReconciliation.findMany({ where: { tenantId, state: 'PENDING' }, select: { id: true, paymentId: true, createdAt: true, payment: { select: { amountPyg: true, currency: true, originalAmount: true, order: { select: { branchId: true, orderNumber: true } } } } }, take: 100 }),
    // Cuenta a pagar al proveedor por repuestos/insumos (#250 · #83): contado,
    // crédito con vencimiento y consignación (que recién impacta al consumirse).
    prisma.supplierPayable.findMany({ where: { tenantId, ...branchFilter }, select: { id: true, supplierId: true, supplierName: true, concept: true, condition: true, amountPyg: true, paidPyg: true, consumedPyg: true, dueAt: true, reference: true, createdAt: true }, orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }], take: 2000 }),
  ])
  const receivables = orders.map(order => ({ id: order.id, totalPyg: order.totalPyg, paidPyg: order.payments.filter(payment => payment.status === 'CONFIRMED').reduce((total, payment) => total + payment.amountPyg, 0) })).map(row => ({ ...row, pendingPyg: Math.max(0, row.totalPyg - row.paidPyg) })).filter(row => row.pendingPyg > 0)
  const payables = purchases.map(purchasePayable).filter(row => row.pendingPyg > 0)
  // Los KPI de la tarjeta (por cobrar, por pagar y margen real) se calculan
  // sobre TODO el historial: las listas de abajo se cortan en 5.000 filas y sus
  // totales no pueden depender de ese tope (#83, misma regla que créditos).
  const branchOrden = ctx.branchId ? Prisma.sql`AND o."branchId" = ${ctx.branchId}` : Prisma.empty
  const branchCompra = ctx.branchId ? Prisma.sql`AND po."branchId" = ${ctx.branchId}` : Prisma.empty
  const branchProveedor = ctx.branchId ? Prisma.sql`AND sp."branchId" = ${ctx.branchId}` : Prisma.empty
  const [receivablesTotales, payablesTotales, margenTotales, proveedoresTotales] = await Promise.all([
    prisma.$queryRaw<Array<{ totalPyg: bigint; orders: number }>>`SELECT
      COALESCE(SUM(t.pendiente) FILTER (WHERE t.pendiente > 0), 0)::bigint AS "totalPyg",
      COUNT(*) FILTER (WHERE t.pendiente > 0)::int AS "orders"
      FROM (SELECT GREATEST(0, o."totalPyg" - COALESCE(p.confirmed, 0)) AS pendiente
        FROM "Order" o
        LEFT JOIN (SELECT "orderId", SUM("amountPyg") AS confirmed FROM "Payment" WHERE "tenantId" = ${tenantId} AND status = 'CONFIRMED' GROUP BY "orderId") p ON p."orderId" = o."id"
        WHERE o."tenantId" = ${tenantId} AND o.status <> 'CANCELLED' ${branchOrden}) t`,
    prisma.$queryRaw<Array<{ totalPyg: bigint; purchases: number }>>`SELECT
      COALESCE(SUM(t.pendiente) FILTER (WHERE t.pendiente > 0), 0)::bigint AS "totalPyg",
      COUNT(*) FILTER (WHERE t.pendiente > 0)::int AS "purchases"
      FROM (SELECT GREATEST(0, c."totalPyg" - COALESCE(p."paidPyg", 0)) AS pendiente
        FROM (SELECT po."id", COALESCE(SUM(pl."finalTotalCostPyg"), 0) AS "totalPyg" FROM "PurchaseOrder" po
          LEFT JOIN "PurchaseLine" pl ON pl."purchaseId" = po."id"
          WHERE po."tenantId" = ${tenantId} ${branchCompra} GROUP BY po."id") c
        LEFT JOIN (SELECT "purchaseId", SUM("amountPyg") AS "paidPyg" FROM "PurchasePayment" WHERE "tenantId" = ${tenantId} GROUP BY "purchaseId") p ON p."purchaseId" = c."id") t`,
    prisma.$queryRaw<Array<{ revenuePyg: bigint; discountPyg: bigint; costPyg: bigint; unknownCostLines: number }>>`SELECT
      (SELECT COALESCE(SUM(i."totalPyg"), 0)::bigint FROM "OrderItem" i JOIN "Order" o ON o."id" = i."orderId" WHERE o."tenantId" = ${tenantId} AND o.status <> 'CANCELLED' ${branchOrden}) AS "revenuePyg",
      (SELECT COALESCE(SUM(o."discountPyg"), 0)::bigint FROM "Order" o WHERE o."tenantId" = ${tenantId} AND o.status <> 'CANCELLED' ${branchOrden}) AS "discountPyg",
      (SELECT COALESCE(SUM(i."unitCostPyg"::bigint * i.quantity), 0)::bigint FROM "OrderItem" i JOIN "Order" o ON o."id" = i."orderId" WHERE o."tenantId" = ${tenantId} AND o.status <> 'CANCELLED' AND i."unitCostPyg" IS NOT NULL ${branchOrden}) AS "costPyg",
      (SELECT COUNT(*)::int FROM "OrderItem" i JOIN "Order" o ON o."id" = i."orderId" WHERE o."tenantId" = ${tenantId} AND o.status <> 'CANCELLED' AND i."unitCostPyg" IS NULL ${branchOrden}) AS "unknownCostLines"`,
    // Proveedores: totales sobre todo el historial (no dependen del tope de la
    // lista) y el reloj de Postgres decide qué está vencido o por vencer.
    prisma.$queryRaw<Array<{ totalPyg: bigint; vencidasPyg: bigint; porVencerPyg: bigint; depositoPyg: bigint; compras: number }>>`SELECT
      COALESCE(SUM(p.pendiente), 0)::bigint AS "totalPyg",
      COALESCE(SUM(p.pendiente) FILTER (WHERE p."dueAt" IS NOT NULL AND p."dueAt" < NOW()), 0)::bigint AS "vencidasPyg",
      COALESCE(SUM(p.pendiente) FILTER (WHERE p."dueAt" >= NOW() AND p."dueAt" < NOW() + INTERVAL '7 days'), 0)::bigint AS "porVencerPyg",
      COALESCE(SUM(p.deposito), 0)::bigint AS "depositoPyg",
      COUNT(*) FILTER (WHERE p.pendiente > 0 OR p.deposito > 0)::int AS "compras"
      FROM (SELECT
        sp."dueAt",
        CASE WHEN sp."condition" = 'CREDITO' THEN GREATEST(0, sp."amountPyg" - sp."paidPyg")
             WHEN sp."condition" = 'CONSIGNACION' THEN GREATEST(0, LEAST(sp."consumedPyg", sp."amountPyg") - sp."paidPyg")
             ELSE 0 END AS pendiente,
        CASE WHEN sp."condition" = 'CONSIGNACION' THEN GREATEST(0, sp."amountPyg" - LEAST(sp."consumedPyg", sp."amountPyg")) ELSE 0 END AS deposito
        FROM "SupplierPayable" sp WHERE sp."tenantId" = ${tenantId} ${branchProveedor}) p`,
  ])
  const margen = margenTotales[0] || { revenuePyg: 0n, discountPyg: 0n, costPyg: 0n, unknownCostLines: 0 }
  const margenNeto = Math.max(0, Number(margen.revenuePyg) - Number(margen.discountPyg))
  const margenCosto = Number(margen.costPyg)
  const marginTotal = {
    revenuePyg: margenNeto,
    costPyg: margenCosto,
    profitPyg: margenNeto - margenCosto,
    marginPct: margenNeto ? Number((((margenNeto - margenCosto) / margenNeto) * 100).toFixed(2)) : null,
    unknownCostLines: Number(margen.unknownCostLines),
  }
  const balances = new Map(accounts.map(account => [account.id, { ...account, balance: 0 }]))
  for (const movement of movements) if (movement.status === 'CLEARED' && movement.accountId && balances.has(movement.accountId)) balances.get(movement.accountId)!.balance += (movement.direction === 'IN' ? 1 : -1) * Number(movement.originalAmount)
  for (const payment of salePayments) if (payment.accountId && balances.has(payment.accountId)) balances.get(payment.accountId)!.balance += Number(payment.originalAmount ?? payment.amountPyg)
  for (const purchase of purchases) for (const payment of purchase.payments) if (payment.accountId && balances.has(payment.accountId)) balances.get(payment.accountId)!.balance -= Number(payment.originalAmount ?? payment.amountPyg)
  return json({
    movements, accounts: [...balances.values()],
    receivables: { rows: receivables, totalPyg: Number(receivablesTotales[0]?.totalPyg ?? 0), orders: Number(receivablesTotales[0]?.orders ?? 0) },
    payables: { rows: payables, totalPyg: Number(payablesTotales[0]?.totalPyg ?? 0), purchases: Number(payablesTotales[0]?.purchases ?? 0) },
    // Repuestos/insumos (#250 · #83): lo pagable según condición, con
    // vencimientos; `depositoPyg` es la tenencia del proveedor que todavía no
    // impacta (consignación sin consumir).
    supplierPayables: {
      rows: supplierPayablesRows
        .map(fila => ({ ...fila, pendientePyg: pendienteDeCompra(fila), depositoPyg: enDepositoDeCompra(fila), vencimiento: estadoDeVencimiento(fila.dueAt) }))
        .filter(fila => fila.pendientePyg > 0 || fila.depositoPyg > 0),
      totalPyg: Number(proveedoresTotales[0]?.totalPyg ?? 0),
      vencidasPyg: Number(proveedoresTotales[0]?.vencidasPyg ?? 0),
      porVencerPyg: Number(proveedoresTotales[0]?.porVencerPyg ?? 0),
      depositoPyg: Number(proveedoresTotales[0]?.depositoPyg ?? 0),
      compras: Number(proveedoresTotales[0]?.compras ?? 0),
    },
    margin: marginTotal,
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
      const description = text(body.description, 'Descripción', 500, true)!
      const accountId = text(body.accountId, 'Cuenta', 200)
      const dueAt = body.dueAt ? new Date(String(body.dueAt)) : null
      if (dueAt && !Number.isFinite(dueAt.getTime())) throw new FinanceInputError('Vencimiento inválido.')
      const movement = await prisma.$transaction(async tx => {
        if (accountId) {
          const account = await tx.paymentAccount.findFirst({ where: { id: accountId, tenantId: ctx.session.user.tenantId, isActive: true }, select: { id: true, currency: true } })
          if (!account || account.currency !== currency) throw new FinanceInputError('La cuenta no corresponde a la moneda.')
        }
        // Gasto por encima del umbral de la empresa: los roles operativos
        // necesitan una autorización aprobada que cubra el monto.
        const amountPyg = frozenAmountPyg(originalAmount, currency as PaymentCurrency, exchangeRatePyg)
        let gastoAutorizado: { id: string; maxAmountPyg: number } | null = null
        if (kind === 'EXPENSE' && ctx.session.user.role !== 'ADMIN' && ctx.session.user.role !== 'GERENTE') {
          const tenantLimits = await tx.tenant.findUnique({ where: { id: ctx.session.user.tenantId }, select: { expenseLimitPyg: true } })
          const limit = tenantLimits?.expenseLimitPyg ?? DEFAULT_EXPENSE_LIMIT_PYG
          if (amountPyg > limit) {
            const authorizationId = typeof body.expenseAuthorizationId === 'string' ? body.expenseAuthorizationId.trim().slice(0, 200) : ''
            const authorization = authorizationId
              ? await tx.customerAuthorization.findFirst({ where: { id: authorizationId, tenantId: ctx.session.user.tenantId } })
              : null
            usableAuthorization(authorization, { userId: ctx.session.user.id, kinds: ['EXPENSE_OVER_LIMIT'], label: 'gasto' })
            const maxAmountPyg = authorizedAmountOf(authorization!.resolvedValue, 'maxAmountPyg')
            if (maxAmountPyg < 0 || amountPyg > maxAmountPyg) throw new InputError('La autorización de gasto no alcanza el monto. Solicitá una nueva.', 403)
            gastoAutorizado = { id: authorization!.id, maxAmountPyg }
          }
        }
        const movement = await createCashMovement(tx, {
          tenantId: ctx.session.user.tenantId, branchId: ctx.branchId, createdById: ctx.session.user.id,
          kind: kind as CashMovementKind, direction: direction as CashDirection, currency: currency as PaymentCurrency,
          originalAmount, exchangeRatePyg,
          counterparty: text(body.counterparty, 'Contraparte', 200),
          reference: text(body.reference, 'Referencia', 200),
          description, dueAt, accountId,
        }, { auditAction: 'FINANCE_MOVEMENT_CREATED' })
        if (gastoAutorizado) {
          await consumeAuthorization(tx, { id: gastoAutorizado.id, tenantId: ctx.session.user.tenantId, kinds: ['EXPENSE_OVER_LIMIT'], userId: ctx.session.user.id, label: 'gasto' })
          await tx.auditLog.create({ data: { tenantId: ctx.session.user.tenantId, userId: ctx.session.user.id, action: 'EXPENSE_AUTHORIZED', entity: 'CashMovement', entityId: movement.id, metadata: { authorizationId: gastoAutorizado.id, amountPyg, maxAmountPyg: gastoAutorizado.maxAmountPyg, kind } } })
        }
        return movement
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
    // ── Proveedores de repuestos/insumos (#250 · #83) ─────────────────────
    // La compra nace con su condición: contado (pagada al recibir), crédito
    // (con vencimiento) o consignación/depósito (no impacta hasta el consumo).
    if (action === 'supplierPayable') {
      const supplierName = text(body.supplierName, 'Proveedor', 200, true)!
      const supplierId = text(body.supplierId, 'Proveedor', 200)
      const concept = text(body.concept, 'Concepto', 200, true)!
      const condition = String(body.condition ?? 'CREDITO')
      if (!(SUPPLIER_PAYABLE_CONDITIONS as readonly string[]).includes(condition)) throw new FinanceInputError('La condición de pago tiene que ser contado, crédito o consignación.')
      const amountPyg = Number(body.amountPyg)
      const dueAt = body.dueAt ? new Date(String(body.dueAt)) : null
      if (dueAt && !Number.isFinite(dueAt.getTime())) throw new FinanceInputError('Vencimiento inválido.')
      if (condition === 'CREDITO' && !dueAt) throw new FinanceInputError('Indicá el vencimiento de la compra a crédito.')
      const paidPyg = condition === 'CONTADO' ? amountPyg : 0
      const accountId = text(body.accountId, 'Cuenta', 200)
      const creado = await prisma.$transaction(async tx => {
        if (accountId) {
          const account = await tx.paymentAccount.findFirst({ where: { id: accountId, tenantId: ctx.session.user.tenantId, isActive: true }, select: { id: true } })
          if (!account) throw new FinanceInputError('La cuenta no existe o está inactiva.')
        }
        const fila = await tx.supplierPayable.create({
          data: {
            tenantId: ctx.session.user.tenantId, branchId: ctx.branchId, supplierId, supplierName, concept,
            condition: condition as (typeof SUPPLIER_PAYABLE_CONDITIONS)[number], amountPyg, paidPyg, dueAt,
            reference: text(body.reference, 'Referencia', 200), notes: text(body.notes, 'Nota', 500),
            createdById: ctx.session.user.id,
          },
        })
        if (paidPyg > 0 && accountId) {
          await createCashMovement(tx, {
            tenantId: ctx.session.user.tenantId, branchId: ctx.branchId, createdById: ctx.session.user.id,
            kind: 'SUPPLIER_ADVANCE', direction: 'OUT', currency: 'PYG', originalAmount: String(paidPyg), exchangeRatePyg: '1',
            counterparty: supplierName, reference: fila.reference, description: `Compra de repuestos al contado: ${concept}`, dueAt: null, accountId,
          }, { auditAction: 'FINANCE_MOVEMENT_CREATED' })
        }
        await tx.auditLog.create({ data: { tenantId: ctx.session.user.tenantId, userId: ctx.session.user.id, action: 'SUPPLIER_PAYABLE_CREATED', entity: 'SupplierPayable', entityId: fila.id, metadata: { condition, amountPyg, paidPyg, dueAt: dueAt?.toISOString() ?? null, supplierName } } })
        return fila
      })
      return json({ ...creado, pendientePyg: pendienteDeCompra(creado), depositoPyg: enDepositoDeCompra(creado), vencimiento: estadoDeVencimiento(creado.dueAt) }, { status: 201 })
    }
    if (action === 'supplierPayment') {
      const id = text(body.id, 'Compra', 200, true)!
      const amountPyg = Number(body.amountPyg)
      const accountId = text(body.accountId, 'Cuenta', 200)
      const actualizado = await prisma.$transaction(async tx => {
        const compra = await tx.supplierPayable.findFirst({ where: { id, tenantId: ctx.session.user.tenantId, ...(ctx.branchId ? { branchId: ctx.branchId } : {}) } })
        if (!compra) throw new FinanceInputError('La compra no existe.')
        const pendiente = pendienteDeCompra(compra)
        if (!Number.isSafeInteger(amountPyg) || amountPyg < 1 || amountPyg > pendiente) throw new FinanceInputError(pendiente > 0 ? `El pago tiene que estar entre 1 y ${pendiente} Gs.` : 'Esa compra no tiene saldo pendiente.')
        if (accountId) {
          const account = await tx.paymentAccount.findFirst({ where: { id: accountId, tenantId: ctx.session.user.tenantId, isActive: true }, select: { id: true } })
          if (!account) throw new FinanceInputError('La cuenta no existe o está inactiva.')
        }
        const fila = await tx.supplierPayable.update({ where: { id: compra.id }, data: { paidPyg: { increment: amountPyg } } })
        if (accountId) {
          await createCashMovement(tx, {
            tenantId: ctx.session.user.tenantId, branchId: compra.branchId, createdById: ctx.session.user.id,
            kind: 'SUPPLIER_ADVANCE', direction: 'OUT', currency: 'PYG', originalAmount: String(amountPyg), exchangeRatePyg: '1',
            counterparty: compra.supplierName, reference: compra.reference, description: `Pago a proveedor: ${compra.concept}`, dueAt: null, accountId,
          }, { auditAction: 'FINANCE_MOVEMENT_CREATED' })
        }
        await tx.auditLog.create({ data: { tenantId: ctx.session.user.tenantId, userId: ctx.session.user.id, action: 'SUPPLIER_PAYABLE_PAID', entity: 'SupplierPayable', entityId: compra.id, metadata: { amountPyg, saldoAnteriorPyg: pendiente, conCuenta: Boolean(accountId) } } })
        return fila
      })
      return json({ ...actualizado, pendientePyg: pendienteDeCompra(actualizado), depositoPyg: enDepositoDeCompra(actualizado), vencimiento: estadoDeVencimiento(actualizado.dueAt) })
    }
    if (action === 'supplierConsumption') {
      const id = text(body.id, 'Compra', 200, true)!
      const amountPyg = Number(body.amountPyg)
      const actualizado = await prisma.$transaction(async tx => {
        const compra = await tx.supplierPayable.findFirst({ where: { id, tenantId: ctx.session.user.tenantId, condition: 'CONSIGNACION', ...(ctx.branchId ? { branchId: ctx.branchId } : {}) } })
        if (!compra) throw new FinanceInputError('La compra en consignación no existe.')
        const enDeposito = enDepositoDeCompra(compra)
        if (!Number.isSafeInteger(amountPyg) || amountPyg < 1 || amountPyg > enDeposito) throw new FinanceInputError(enDeposito > 0 ? `El consumo tiene que estar entre 1 y ${enDeposito} Gs.` : 'Esa consignación ya está consumida del todo.')
        const fila = await tx.supplierPayable.update({ where: { id: compra.id }, data: { consumedPyg: { increment: amountPyg } } })
        await tx.auditLog.create({ data: { tenantId: ctx.session.user.tenantId, userId: ctx.session.user.id, action: 'SUPPLIER_PAYABLE_CONSUMED', entity: 'SupplierPayable', entityId: compra.id, metadata: { amountPyg, enDepositoAnteriorPyg: enDeposito } } })
        return fila
      })
      return json({ ...actualizado, pendientePyg: pendienteDeCompra(actualizado), depositoPyg: enDepositoDeCompra(actualizado), vencimiento: estadoDeVencimiento(actualizado.dueAt) })
    }
    throw new FinanceInputError('Acción financiera inválida.')
  } catch (cause) {
    if (cause instanceof InputError) return error(cause.message, cause.status)
    return error(cause instanceof Error ? cause.message : 'No se pudo guardar el movimiento.', cause instanceof FinanceInputError || cause instanceof SupplierPayableInputError || cause instanceof SyntaxError ? 400 : 409)
  }
}
