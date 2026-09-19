import { randomUUID } from 'node:crypto'
import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { InputError } from '../../../lib/payment-input'
import { applyPurchaseLineOverrides, distributePurchaseCosts, purchaseTotals } from '../../../lib/purchases'
import type { PurchaseLineCostOverride } from '../../../lib/purchases'
import { DEFAULT_PURCHASE_CREDIT_LIMIT_PYG, authorizedAmountOf, authorizationValueOf, consumeAuthorization, usableAuthorization } from '../../../lib/authorizations'

const INT_MAX = 2147483647
const MAX_TEXT = 160
const MAX_ID = 128
const MAX_LINES = 200
const statuses = new Set(['DRAFT', 'RECEIVED'])
const safePyg = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= INT_MAX
const boundedText = (value: unknown, max = MAX_TEXT) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max
const currencies = new Set(['PYG', 'USD', 'BRL', 'EUR', 'USDT'])
const decimal = (value: unknown, decimals = 2) => {
  if (typeof value !== 'number' && typeof value !== 'string') return false
  const raw = String(value)
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return false
  const fraction = raw.split('.')[1]
  return !fraction || fraction.length <= decimals
}

function scope(session: { user: { role: string; branchId: string | null } }) {
  return session.user.role === 'ADMIN' ? null : (session.user.branchId || '')
}

export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (session.user.role === 'VENDEDOR') return error('No autorizado.', 403)
  const branchId = scope(session); if (branchId === '') return json([])
  // Búsqueda del header global: proveedor (nombre o código), referencia y número interno.
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 120)
  const params: unknown[] = [tenant]; const branchSql = branchId ? ' AND po."branchId" = $2' : ''
  if (branchId) params.push(branchId)
  let searchSql = ''
  if (q) {
    // Patrón LIKE literal: % y _ del texto buscado no actúan como comodines.
    params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`)
    const pos = `$${params.length}`
    searchSql = ` AND (po."supplierName" ILIKE ${pos} OR COALESCE(po."supplierReference", '') ILIKE ${pos} OR po."id" ILIKE ${pos} OR EXISTS (SELECT 1 FROM "Supplier" s WHERE s."id" = po."supplierId" AND (s."name" ILIKE ${pos} OR COALESCE(s."code", '') ILIKE ${pos})))`
  }
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT po.*, COALESCE(json_agg(DISTINCT jsonb_build_object('id', pl."id", 'productId', pl."productId", 'productName', p."name", 'quantity', pl."quantity", 'unitCostPyg', pl."unitCostPyg", 'lotReference', pl."lotReference", 'baseTotalPyg', pl."baseTotalPyg", 'allocatedShippingPyg', pl."allocatedShippingPyg", 'allocatedCustomsPyg', pl."allocatedCustomsPyg", 'allocatedInsurancePyg', pl."allocatedInsurancePyg", 'allocatedTaxesPyg', pl."allocatedTaxesPyg", 'allocatedOtherCostsPyg', pl."allocatedOtherCostsPyg", 'allocatedExtraCostPyg', pl."allocatedExtraCostPyg", 'finalTotalCostPyg', pl."finalTotalCostPyg", 'finalUnitCostPyg', pl."finalUnitCostPyg")) FILTER (WHERE pl."id" IS NOT NULL), '[]') AS lines, COALESCE(json_agg(DISTINCT jsonb_build_object('id', pp."id", 'amountPyg', pp."amountPyg", 'currency', pp."currency", 'originalAmount', pp."originalAmount", 'reference', pp."reference", 'kind', pp."kind", 'paidAt', pp."paidAt")) FILTER (WHERE pp."id" IS NOT NULL), '[]') AS payments FROM "PurchaseOrder" po LEFT JOIN "PurchaseLine" pl ON pl."purchaseId" = po."id" LEFT JOIN "Product" p ON p."id" = pl."productId" LEFT JOIN "PurchasePayment" pp ON pp."purchaseId" = po."id" WHERE po."tenantId" = $1${branchSql}${searchSql} GROUP BY po."id" ORDER BY po."createdAt" DESC LIMIT 100`, ...params)
  return json(rows.map(row => ({ ...row, ...purchaseTotals(row.lines || [], row.payments || []) })))
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE'].includes(session.user.role)) return error('No autorizado.', 403)
  const body = await request.json(); const lines = Array.isArray(body.lines) ? body.lines : []
  const shippingPyg = Number(body.shippingPyg ?? 0); const customsPyg = Number(body.customsPyg ?? 0); const insurancePyg = Number(body.insurancePyg ?? 0); const taxesPyg = Number(body.taxesPyg ?? 0); const otherCostsPyg = Number(body.otherCostsPyg ?? 0)
  const currency = body.currency ?? 'PYG'; const exchangeRatePyg = body.exchangeRatePyg ?? 1
  const costAllocationMethod = body.costAllocationMethod ?? 'PROPORTIONAL_VALUE'
  if (!boundedText(body.supplierName) || lines.length === 0 || lines.length > MAX_LINES || ![shippingPyg, customsPyg, insurancePyg, taxesPyg, otherCostsPyg].every(safePyg) || !currencies.has(currency) || !decimal(exchangeRatePyg, 6) || Number(exchangeRatePyg) <= 0 || (currency === 'PYG' && Number(exchangeRatePyg) !== 1) || !['PROPORTIONAL_VALUE', 'PROPORTIONAL_QUANTITY'].includes(costAllocationMethod) || (body.originalSubtotal !== undefined && (!decimal(body.originalSubtotal) || Number(body.originalSubtotal) < 0))) return error('Proveedor, líneas, moneda, distribución y montos válidos son obligatorios.')
  const assignedBranchId = scope(session)
  if (assignedBranchId === '') return error('El usuario no tiene sucursal asignada.', 403)
  const requestedBranchId = body.branchId === undefined || body.branchId === null || body.branchId === '' ? null : body.branchId
  if (requestedBranchId !== null && (!boundedText(requestedBranchId, MAX_ID) || (assignedBranchId !== null && requestedBranchId !== assignedBranchId))) return error('Sucursal no autorizada.', 403)
  const branchId = assignedBranchId === null ? requestedBranchId : assignedBranchId
  try {
    const result = await prisma.$transaction(async tx => {
      if (branchId) {
        const branchRows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Branch" WHERE "id" = ${branchId} AND "tenantId" = ${tenant} AND "isActive" = true`
        if (branchRows.length === 0) throw new Error('Sucursal no encontrada.')
      }
      const normalized: Array<{ id: string; productId: string; quantity: number; unitCostPyg: number; lotReference: string | null }> = []
      for (const line of lines) {
        const quantity = Number(line.quantity); const unitCostPyg = Number(line.unitCostPyg ?? line.unitCost ?? 0)
        if (!boundedText(line.productId, MAX_ID) || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > INT_MAX || !safePyg(unitCostPyg)) throw new Error('Línea de compra inválida.')
        const product = await tx.$queryRaw<Array<{ id: string; branchId: string | null }>>`SELECT "id", "branchId" FROM "Product" WHERE "id" = ${line.productId} AND "tenantId" = ${tenant} AND "isActive" = true`
        const p = product[0]
        if (!p || (branchId === null ? p.branchId !== null : p.branchId !== null && p.branchId !== branchId)) throw new Error('Producto fuera del tenant o sucursal.')
        const lineTotal = quantity * unitCostPyg
        const lotReference = line.lotReference === undefined || line.lotReference === '' ? null : boundedText(line.lotReference, 120) ? String(line.lotReference).trim() : null
        if (!Number.isSafeInteger(lineTotal) || lineTotal > INT_MAX || (line.lotReference !== undefined && line.lotReference !== '' && !lotReference)) throw new Error('Línea de compra o lote inválido.')
        normalized.push({ id: randomUUID(), productId: p.id, quantity, unitCostPyg, lotReference })
      }
      const costing = distributePurchaseCosts(normalized, { shippingPyg, customsPyg, insurancePyg, taxesPyg, otherCostsPyg, method: costAllocationMethod })
      const { finalCostPyg: totalCost } = purchaseTotals(costing)
      if (!safePyg(totalCost)) throw new Error('Costo acumulado fuera de rango.')
      const purchaseId = randomUUID()
      let supplierId = body.supplierId === undefined || body.supplierId === '' ? null : String(body.supplierId)
      let supplierName = body.supplierName.trim()
      if (supplierId) {
        const supplier = await tx.supplier.findFirst({ where: { id: supplierId, tenantId: tenant, isActive: true } })
        if (!supplier) throw new Error('Proveedor no encontrado.')
        supplierName = supplier.name
      } else {
        const supplier = await tx.supplier.upsert({ where: { tenantId_name: { tenantId: tenant, name: supplierName } }, create: { tenantId: tenant, name: supplierName }, update: {} })
        supplierId = supplier.id
      }
      const dueAt = body.dueAt ? new Date(String(body.dueAt)) : null
      if (dueAt && !Number.isFinite(dueAt.getTime())) throw new Error('Fecha de vencimiento inválida.')
      const supplierReference = body.supplierReference === undefined || body.supplierReference === '' ? null : boundedText(body.supplierReference, 200) ? String(body.supplierReference).trim() : null
      if (body.supplierReference !== undefined && body.supplierReference !== '' && !supplierReference) throw new Error('Referencia de proveedor inválida.')
      // Compra a crédito por encima del umbral de la empresa: los roles que no
      // son ADMIN necesitan una autorización aprobada que cubra el total.
      let compraAutorizada: { id: string; maxTotalPyg: number } | null = null
      if (Boolean(body.creditEnabled) && session.user.role !== 'ADMIN') {
        const tenantLimits = await tx.tenant.findUnique({ where: { id: tenant }, select: { purchaseCreditLimitPyg: true } })
        const limit = tenantLimits?.purchaseCreditLimitPyg ?? DEFAULT_PURCHASE_CREDIT_LIMIT_PYG
        if (totalCost > limit) {
          const authorizationId = typeof body.purchaseAuthorizationId === 'string' ? body.purchaseAuthorizationId.trim().slice(0, 128) : ''
          const authorization = authorizationId
            ? await tx.customerAuthorization.findFirst({ where: { id: authorizationId, tenantId: tenant } })
            : null
          usableAuthorization(authorization, { userId: session.user.id, kinds: ['PURCHASE_CREDIT'], label: 'compra a crédito' })
          const maxTotalPyg = authorizedAmountOf(authorization!.resolvedValue, 'maxTotalPyg')
          if (maxTotalPyg < 0 || totalCost > maxTotalPyg) throw new InputError('La autorización de compra a crédito no alcanza el total. Solicitá una nueva.', 403)
          const requested = authorizationValueOf(authorization!.requestedValue)
          if (typeof requested.supplierId === 'string' && supplierId && requested.supplierId !== supplierId) {
            throw new InputError('La autorización de compra es de otro proveedor. Solicitá una nueva.', 403)
          }
          compraAutorizada = { id: authorization!.id, maxTotalPyg }
        }
      }
      await tx.$executeRaw`INSERT INTO "PurchaseOrder" ("id", "tenantId", "branchId", "supplierName", "supplierId", "createdById", "shippingPyg", "customsPyg", "insurancePyg", "taxesPyg", "otherCostsPyg", "currency", "exchangeRatePyg", "originalSubtotal", "dueAt", "supplierReference", "creditEnabled", "costAllocationMethod") VALUES (${purchaseId}, ${tenant}, ${branchId}, ${supplierName}, ${supplierId}, ${session.user.id}, ${shippingPyg}, ${customsPyg}, ${insurancePyg}, ${taxesPyg}, ${otherCostsPyg}, ${currency}::"PaymentCurrency", ${String(exchangeRatePyg)}::decimal, ${body.originalSubtotal === undefined ? null : String(body.originalSubtotal)}::decimal, ${dueAt}, ${supplierReference}, ${Boolean(body.creditEnabled)}, ${costAllocationMethod}::"PurchaseCostAllocationMethod")`
      for (const line of costing) await tx.$executeRaw`INSERT INTO "PurchaseLine" ("id", "purchaseId", "productId", "quantity", "unitCostPyg", "lotReference", "baseTotalPyg", "allocatedShippingPyg", "allocatedCustomsPyg", "allocatedInsurancePyg", "allocatedTaxesPyg", "allocatedOtherCostsPyg", "allocatedExtraCostPyg", "finalTotalCostPyg", "finalUnitCostPyg") VALUES (${line.id}, ${purchaseId}, ${line.productId}, ${line.quantity}, ${line.unitCostPyg}, ${line.lotReference}, ${line.baseTotalPyg}, ${line.allocatedShippingPyg}, ${line.allocatedCustomsPyg}, ${line.allocatedInsurancePyg}, ${line.allocatedTaxesPyg}, ${line.allocatedOtherCostsPyg}, ${line.allocatedExtraCostPyg}, ${line.finalTotalCostPyg}, ${line.finalUnitCostPyg})`
      if (compraAutorizada) {
        await consumeAuthorization(tx, { id: compraAutorizada.id, tenantId: tenant, kinds: ['PURCHASE_CREDIT'], userId: session.user.id, label: 'compra a crédito' })
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'PURCHASE_AUTHORIZED', entity: 'PurchaseOrder', entityId: purchaseId, metadata: { authorizationId: compraAutorizada.id, totalPyg: totalCost, maxTotalPyg: compraAutorizada.maxTotalPyg, supplierId } } })
      }
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'PURCHASE_CREATED', entity: 'PurchaseOrder', entityId: purchaseId, metadata: { branchId, supplierId, supplierName, lineCount: normalized.length, shippingPyg, customsPyg, insurancePyg, taxesPyg, otherCostsPyg, currency, exchangeRatePyg, costAllocationMethod, creditEnabled: Boolean(body.creditEnabled), totalCost, allocations: costing.map(line => ({ productId: line.productId, lotReference: line.lotReference, baseTotalPyg: line.baseTotalPyg, extraPyg: line.allocatedExtraCostPyg, finalTotalPyg: line.finalTotalCostPyg })) } } })
      return { id: purchaseId, tenantId: tenant, branchId, supplierId, supplierName, status: 'DRAFT', shippingPyg, customsPyg, insurancePyg, taxesPyg, otherCostsPyg, currency, exchangeRatePyg, costAllocationMethod, creditEnabled: Boolean(body.creditEnabled), lines: costing, payments: [], ...purchaseTotals(costing) }
    })
    return json(result, { status: 201 })
  } catch (e) {
    if (e instanceof InputError) return error(e.message, e.status)
    return error(e instanceof Error ? e.message : 'No se pudo crear la compra.', 409)
  }
}

export async function PATCH(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE'].includes(session.user.role)) return error('No autorizado.', 403)
  const body = await request.json(); if (!boundedText(body.id, MAX_ID) || !['receive', 'pay', 'advance', 'update-costs'].includes(body.action)) return error('Compra y acción válida son obligatorias.')
  try {
    const result = await prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ id: string; branchId: string | null; status: string }>>`SELECT "id", "branchId", "status" FROM "PurchaseOrder" WHERE "id" = ${body.id} AND "tenantId" = ${tenant} FOR UPDATE`
      const purchase = rows[0]
      const branchId = scope(session)
      if (!purchase || (branchId !== null && purchase.branchId !== branchId)) throw new Error('Compra no encontrada.')
      if (body.action === 'pay' || body.action === 'advance') {
        const accountId = boundedText(body.accountId, MAX_ID) ? String(body.accountId) : null
        const currency = body.currency ?? 'PYG'; const originalAmount = Number(body.originalAmount); const exchangeRatePyg = Number(body.exchangeRatePyg ?? 1)
        if (!accountId || !currencies.has(currency) || !decimal(body.originalAmount) || originalAmount <= 0 || !decimal(exchangeRatePyg, 6) || exchangeRatePyg <= 0 || (currency === 'PYG' && exchangeRatePyg !== 1)) throw new Error('Cuenta, moneda, monto y cotización válidos son obligatorios.')
        const account = await tx.paymentAccount.findFirst({ where: { id: accountId, tenantId: tenant, isActive: true } })
        if (!account || account.currency !== currency) throw new Error('Cuenta de pago no válida para la moneda indicada.')
        const amountPyg = Math.round(originalAmount * exchangeRatePyg)
        if (!safePyg(amountPyg) || amountPyg === 0) throw new Error('Monto convertido fuera de rango.')
        const kind = body.action === 'advance' || body.kind === 'ADVANCE' ? 'ADVANCE' : 'SETTLEMENT'
        if (kind === 'ADVANCE') {
          const balanceRows = await tx.$queryRaw<Array<{ finalCostPyg: number; paidPyg: number }>>`SELECT COALESCE((SELECT SUM(pl."finalTotalCostPyg")::int FROM "PurchaseLine" pl WHERE pl."purchaseId" = ${purchase.id}), 0) AS "finalCostPyg", COALESCE((SELECT SUM(pp."amountPyg")::int FROM "PurchasePayment" pp WHERE pp."purchaseId" = ${purchase.id}), 0) AS "paidPyg"`
          if (amountPyg > balanceRows[0].finalCostPyg - balanceRows[0].paidPyg) throw new Error('El anticipo supera el saldo pendiente de la compra.')
        }
        const payment = await tx.purchasePayment.create({ data: { tenantId: tenant, purchaseId: purchase.id, accountId, amountPyg, currency, originalAmount: String(originalAmount), exchangeRatePyg: String(exchangeRatePyg), reference: body.reference ? String(body.reference).slice(0, 200) : null, kind, createdById: session.user.id } })
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: kind === 'ADVANCE' ? 'PURCHASE_ADVANCE' : 'PURCHASE_PAYMENT_RECORDED', entity: 'PurchaseOrder', entityId: purchase.id, metadata: { paymentId: payment.id, accountId, currency, originalAmount, exchangeRatePyg, amountPyg, kind } } })
        return { payment, status: purchase.status }
      }
      if (body.action === 'update-costs') {
        if (purchase.status !== 'DRAFT') throw new Error('Solo se pueden editar costos antes de recibir la compra.')
        const inputLines = Array.isArray(body.lines) ? body.lines : []
        if (inputLines.length === 0 || inputLines.length > MAX_LINES) throw new Error('Líneas de costo inválidas.')
        const overrides: Record<string, PurchaseLineCostOverride> = {}
        for (const item of inputLines) {
          const lineId = item?.id
          const unitCostPyg = Number(item?.unitCostPyg)
          const allocatedFeesPyg = Number(item?.allocatedFeesPyg ?? 0)
          if (!boundedText(lineId, MAX_ID) || !safePyg(unitCostPyg) || !safePyg(allocatedFeesPyg)) throw new Error('Línea de costo inválida.')
          overrides[String(lineId)] = { id: String(lineId), unitCostPyg, allocatedFeesPyg }
        }
        const current = await tx.$queryRaw<Array<{ id: string; quantity: number; unitCostPyg: number; baseTotalPyg: number; allocatedShippingPyg: number; allocatedCustomsPyg: number; allocatedInsurancePyg: number; allocatedTaxesPyg: number; allocatedOtherCostsPyg: number; allocatedExtraCostPyg: number; finalTotalCostPyg: number; finalUnitCostPyg: number }>>`SELECT "id", "quantity", "unitCostPyg", "baseTotalPyg", "allocatedShippingPyg", "allocatedCustomsPyg", "allocatedInsurancePyg", "allocatedTaxesPyg", "allocatedOtherCostsPyg", "allocatedExtraCostPyg", "finalTotalCostPyg", "finalUnitCostPyg" FROM "PurchaseLine" WHERE "purchaseId" = ${purchase.id} FOR UPDATE`
        const currentById = new Map(current.map(line => [line.id, line]))
        for (const lineId of Object.keys(overrides)) if (!currentById.has(lineId)) throw new Error('Línea de compra no encontrada.')
        const updated = applyPurchaseLineOverrides(current, overrides)
        for (const line of updated) if (!safePyg(line.baseTotalPyg) || !safePyg(line.finalTotalCostPyg) || !safePyg(line.finalUnitCostPyg)) throw new Error('Costo acumulado fuera de rango.')
        const { finalCostPyg } = purchaseTotals(updated)
        if (!safePyg(finalCostPyg)) throw new Error('Costo acumulado fuera de rango.')
        for (const lineId of Object.keys(overrides)) {
          const before = currentById.get(lineId)
          const after = updated.find(line => line.id === lineId)
          if (!before || !after) continue
          const snapshot = (line: typeof before) => ({ unitCostPyg: line.unitCostPyg, baseTotalPyg: line.baseTotalPyg, allocatedShippingPyg: line.allocatedShippingPyg, allocatedCustomsPyg: line.allocatedCustomsPyg, allocatedInsurancePyg: line.allocatedInsurancePyg, allocatedTaxesPyg: line.allocatedTaxesPyg, allocatedOtherCostsPyg: line.allocatedOtherCostsPyg, allocatedExtraCostPyg: line.allocatedExtraCostPyg, finalTotalCostPyg: line.finalTotalCostPyg, finalUnitCostPyg: line.finalUnitCostPyg })
          await tx.$executeRaw`UPDATE "PurchaseLine" SET "unitCostPyg" = ${after.unitCostPyg}, "baseTotalPyg" = ${after.baseTotalPyg}, "allocatedShippingPyg" = 0, "allocatedCustomsPyg" = 0, "allocatedInsurancePyg" = 0, "allocatedTaxesPyg" = 0, "allocatedOtherCostsPyg" = 0, "allocatedExtraCostPyg" = ${after.allocatedExtraCostPyg}, "finalTotalCostPyg" = ${after.finalTotalCostPyg}, "finalUnitCostPyg" = ${after.finalUnitCostPyg} WHERE "id" = ${lineId} AND "purchaseId" = ${purchase.id}`
          await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'PURCHASE_COSTS_UPDATED', entity: 'PurchaseLine', entityId: lineId, metadata: { purchaseOrderId: purchase.id, lineId, before: snapshot(before), after: snapshot(after) } } })
        }
        const paidRows = await tx.$queryRaw<Array<{ paidPyg: number }>>`SELECT COALESCE(SUM("amountPyg")::int, 0) AS "paidPyg" FROM "PurchasePayment" WHERE "purchaseId" = ${purchase.id}`
        return { id: purchase.id, status: purchase.status, lines: updated, finalCostPyg, paidPyg: paidRows[0].paidPyg, outstandingPyg: finalCostPyg - paidRows[0].paidPyg }
      }
      if (purchase.status !== 'DRAFT') throw new Error('La compra ya fue recibida.')
      const lines = await tx.$queryRaw`SELECT pl."productId", pl."quantity" FROM "PurchaseLine" pl WHERE pl."purchaseId" = ${purchase.id}` as Array<{ productId: string; quantity: number }>
      for (const line of lines) {
        const updated = await tx.$executeRaw`UPDATE "Product" SET "stock" = "stock" + ${line.quantity}, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${line.productId} AND "tenantId" = ${tenant} AND "isActive" = true AND "stock" + ${line.quantity} <= ${INT_MAX}`
        if (updated !== 1) throw new Error('Producto inexistente o stock fuera de rango.')
      }
      await tx.$executeRaw`UPDATE "PurchaseOrder" SET "status" = 'RECEIVED', "receivedAt" = CURRENT_TIMESTAMP WHERE "id" = ${purchase.id} AND "status" = 'DRAFT'`
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'PURCHASE_RECEIVED', entity: 'PurchaseOrder', entityId: purchase.id, metadata: { branchId: purchase.branchId, lineCount: lines.length } } })
      return { id: purchase.id, status: 'RECEIVED', receivedAt: new Date().toISOString() }
    })
    return json(result)
  } catch (e) { return error(e instanceof Error ? e.message : 'No se pudo recibir la compra.', 409) }
}
