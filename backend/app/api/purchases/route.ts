import { randomUUID } from 'node:crypto'
import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

const INT_MAX = 2147483647
const MAX_TEXT = 160
const MAX_ID = 128
const MAX_LINES = 200
const statuses = new Set(['DRAFT', 'RECEIVED'])
const safePyg = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= INT_MAX
const boundedText = (value: unknown, max = MAX_TEXT) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max

function scope(session: { user: { role: string; branchId: string | null } }) {
  return session.user.role === 'ADMIN' ? null : (session.user.branchId || '')
}

export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const branchId = scope(session); if (branchId === '') return json([])
  const params = [tenant]; const branchSql = branchId ? ' AND po."branchId" = $2' : ''
  if (branchId) params.push(branchId)
  const rows = await prisma.$queryRawUnsafe(`SELECT po.*, COALESCE(json_agg(json_build_object('id', pl."id", 'productId', pl."productId", 'quantity', pl."quantity", 'unitCostPyg', pl."unitCostPyg")) FILTER (WHERE pl."id" IS NOT NULL), '[]') AS lines FROM "PurchaseOrder" po LEFT JOIN "PurchaseLine" pl ON pl."purchaseId" = po."id" WHERE po."tenantId" = $1${branchSql} GROUP BY po."id" ORDER BY po."createdAt" DESC LIMIT 100`, ...params)
  return json(rows)
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE'].includes(session.user.role)) return error('No autorizado.', 403)
  const body = await request.json(); const lines = Array.isArray(body.lines) ? body.lines : []
  const shippingPyg = Number(body.shippingPyg ?? 0); const customsPyg = Number(body.customsPyg ?? 0)
  if (!boundedText(body.supplierName) || lines.length === 0 || lines.length > MAX_LINES || !safePyg(shippingPyg) || !safePyg(customsPyg)) return error('Proveedor, líneas y montos válidos son obligatorios.')
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
      const normalized: Array<{ id: string; productId: string; quantity: number; unitCostPyg: number }> = []
      let totalCost = shippingPyg + customsPyg
      for (const line of lines) {
        const quantity = Number(line.quantity); const unitCostPyg = Number(line.unitCostPyg ?? line.unitCost ?? 0)
        if (!boundedText(line.productId, MAX_ID) || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > INT_MAX || !safePyg(unitCostPyg)) throw new Error('Línea de compra inválida.')
        const product = await tx.$queryRaw<Array<{ id: string; branchId: string | null }>>`SELECT "id", "branchId" FROM "Product" WHERE "id" = ${line.productId} AND "tenantId" = ${tenant} AND "isActive" = true`
        const p = product[0]
        if (!p || (branchId === null ? p.branchId !== null : p.branchId !== null && p.branchId !== branchId)) throw new Error('Producto fuera del tenant o sucursal.')
        const lineTotal = quantity * unitCostPyg
        if (!Number.isSafeInteger(lineTotal) || lineTotal > INT_MAX || totalCost > INT_MAX - lineTotal) throw new Error('Costo acumulado fuera de rango.')
        totalCost += lineTotal
        normalized.push({ id: randomUUID(), productId: p.id, quantity, unitCostPyg })
      }
      const purchaseId = randomUUID()
      const supplierName = body.supplierName.trim()
      await tx.$executeRaw`INSERT INTO "PurchaseOrder" ("id", "tenantId", "branchId", "supplierName", "createdById", "shippingPyg", "customsPyg") VALUES (${purchaseId}, ${tenant}, ${branchId}, ${supplierName}, ${session.user.id}, ${shippingPyg}, ${customsPyg})`
      for (const line of normalized) await tx.$executeRaw`INSERT INTO "PurchaseLine" ("id", "purchaseId", "productId", "quantity", "unitCostPyg") VALUES (${line.id}, ${purchaseId}, ${line.productId}, ${line.quantity}, ${line.unitCostPyg})`
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'PURCHASE_CREATED', entity: 'PurchaseOrder', entityId: purchaseId, metadata: { branchId, supplierName, lineCount: normalized.length, shippingPyg, customsPyg, totalCost } } })
      return { id: purchaseId, tenantId: tenant, branchId, supplierName, status: 'DRAFT', shippingPyg, customsPyg, lines: normalized }
    })
    return json(result, { status: 201 })
  } catch (e) { return error(e instanceof Error ? e.message : 'No se pudo crear la compra.', 409) }
}

export async function PATCH(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE'].includes(session.user.role)) return error('No autorizado.', 403)
  const body = await request.json(); if (!boundedText(body.id, MAX_ID) || body.action !== 'receive') return error('Compra y acción de recepción son obligatorias.')
  try {
    const result = await prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ id: string; branchId: string | null; status: string }>>`SELECT "id", "branchId", "status" FROM "PurchaseOrder" WHERE "id" = ${body.id} AND "tenantId" = ${tenant} FOR UPDATE`
      const purchase = rows[0]
      const branchId = scope(session)
      if (!purchase || (branchId !== null && purchase.branchId !== branchId)) throw new Error('Compra no encontrada.')
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
