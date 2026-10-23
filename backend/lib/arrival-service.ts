// Llegada de mercadería como la planilla (#408, unidad E): borrador, pegado
// con conciliación, edición de líneas y confirmación atómica. El stock, los
// traslados y los ajustes nacen SOLO al confirmar, dentro de una transacción
// con candados (llegada y líneas de compra). Todo por empresa y sucursal.

import { Prisma } from '@prisma/client'
import type { ProductCondition } from '@prisma/client'
import { prisma } from './prisma'
import { InputError } from './payment-input'
import { error, json } from './http'
import { canAccessAny, requireSession } from './auth'
import { canSeeCostForSession, canSeeSupplierName } from './cost-visibility'
import { logError } from './log'
import { changeStock, promoteToEquipo } from './stock'
import { attachSerialsToOrderItem } from './order-serials'
import { crearTraslado } from './transfers'
import { vincularAsignacionAlRecibir } from './transit'
import { primeraSucursal } from './sucursal-efectiva'
import { parseWarrantyUntil } from './unit-code'
import { serialKey } from './validation'
import { createCatalogMatcher, normalizeText, parseArrivalPaste, type ArrivalDestination, type ParsedRow } from './arrival-parse'
import { reconcileArrival, type ExpectedLine, type MatchedRow } from './arrival-match'
import { classifySerialInput, costPygOf, hasError, isActiveLine, isPreSold, redactSummary, summarizeArrival, supplierView, type ArrivalSummary, type StoredIssue } from './arrival-summary'

type Db = Prisma.TransactionClient | typeof prisma

export type ArrivalActor = { tenantId: string; userId: string; role: string; branchId: string | null; canSeeCost: boolean; canSeeSupplier: boolean }

export class ArrivalBlocked extends InputError {
  constructor(message: string, public readonly details: unknown, status = 409) { super(message, status) }
}

const DESTINOS = ['STOCK', 'OTRA_SUCURSAL', 'DEVOLVER', 'FALTA_IMEI', 'TECNICO'] as const
const MAX_PASTE = 400_000
const MAX_ROWS = 1500
const KEY_RE = /^[A-Za-z0-9_-]{8,100}$/
// Códigos del parser que la validación contra la base vuelve a calcular siempre.
const REGENERATED = new Set(['DUPLICADO_EN_LOTE'])

// ------------------------------------------------------------------- acceso

export async function arrivalActor(request: Request): Promise<ArrivalActor | Response> {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['stock:manage'])) return error('No autorizado.', 403)
  return {
    tenantId: session.user.tenantId, userId: session.user.id, role: session.user.role, branchId: session.user.branchId ?? null,
    canSeeCost: await canSeeCostForSession(session), canSeeSupplier: canSeeSupplierName(session.user.role),
  }
}

export function arrivalErrorResponse(cause: unknown, context: string): Response {
  if (cause instanceof InputError) return error(cause.message, cause.status, cause instanceof ArrivalBlocked ? cause.details : undefined)
  if ((cause as { code?: string })?.code === 'P2002') return error('Ese IMEI/serie o clave ya existe.', 409)
  logError(context, { error: cause instanceof Error ? cause.message : String(cause) })
  return error('No se pudo completar la operación.', 500)
}

const canManageBranch = (actor: ArrivalActor, branchId: string) => actor.role === 'ADMIN' || (actor.role === 'GERENTE' && actor.branchId === branchId)

async function loadArrival(db: Db, actor: ArrivalActor, id: string) {
  const arrival = await db.stockArrival.findFirst({ where: { id, tenantId: actor.tenantId } })
  if (!arrival) throw new InputError('Llegada no encontrada.', 404)
  if (actor.role !== 'ADMIN' && arrival.branchId !== actor.branchId) throw new InputError('Llegada no encontrada.', 404)
  return arrival
}

// ----------------------------------------------------------------- serialización

type LineRow = Awaited<ReturnType<typeof prisma.stockArrivalLine.findMany>>[number]
const num = (value: unknown) => (value === null || value === undefined ? null : Number(value))

function issuesOf(line: { issues: unknown }): StoredIssue[] {
  return Array.isArray(line.issues) ? (line.issues as StoredIssue[]) : []
}

function summaryLine(line: LineRow): Parameters<typeof summarizeArrival>[0][number] {
  return { match: line.match, destination: line.destination, serial: line.serial, unitId: line.unitId, orderItemId: line.orderItemId, customerId: line.customerId, costPyg: num(line.costPyg), originalCost: num(line.originalCost), issues: issuesOf(line) }
}

async function viewLines(actor: ArrivalActor, lines: LineRow[]) {
  const supplierIds = [...new Set(lines.map(line => line.supplierId).filter((id): id is string => Boolean(id)))]
  const productIds = [...new Set(lines.map(line => line.productId).filter((id): id is string => Boolean(id)))]
  const [suppliers, products] = await Promise.all([
    supplierIds.length ? prisma.supplier.findMany({ where: { tenantId: actor.tenantId, id: { in: supplierIds } }, select: { id: true, name: true, code: true, icon: true, color: true } }) : [],
    productIds.length ? prisma.product.findMany({ where: { tenantId: actor.tenantId, id: { in: productIds } }, select: { id: true, name: true, sku: true } }) : [],
  ])
  const supplierById = new Map(suppliers.map(item => [item.id, item]))
  const productById = new Map(products.map(item => [item.id, item]))
  return lines.map(line => {
    const { supplierId, raw, ...rest } = line
    return {
      ...rest,
      costPyg: actor.canSeeCost ? num(line.costPyg) : null,
      originalCost: actor.canSeeCost ? num(line.originalCost) : null,
      batteryPct: line.batteryPct, warrantyUntil: line.warrantyUntil,
      supplierId: actor.canSeeCost ? supplierId : null,
      supplier: supplierView(supplierId ? supplierById.get(supplierId) : null, actor.canSeeSupplier),
      product: line.productId ? productById.get(line.productId) ?? null : null,
      raw,
    }
  })
}

async function viewArrival(actor: ArrivalActor, arrival: Awaited<ReturnType<typeof loadArrival>>, withLines = true) {
  const lines = withLines ? await prisma.stockArrivalLine.findMany({ where: { arrivalId: arrival.id, tenantId: actor.tenantId }, orderBy: { rowIndex: 'asc' } }) : []
  const live = arrival.status === 'BORRADOR' ? summarizeArrival(lines.map(summaryLine), arrival.currency as 'USD' | 'PYG') : (arrival.summary as ArrivalSummary | null)
  const { summary: _stored, exchangeRatePyg, ...rest } = arrival
  return {
    ...rest,
    exchangeRatePyg: actor.canSeeCost ? num(exchangeRatePyg) : null,
    summary: redactSummary(live, actor.canSeeCost),
    ...(withLines ? { lines: await viewLines(actor, lines) } : {}),
  }
}

// -------------------------------------------------------------------- crear

function branchSigla(name: string) {
  const letters = normalizeText(name).replace(/[^A-Z]/g, '')
  return (letters.slice(0, 3) || 'SUC').padEnd(3, 'X')
}

export async function createArrival(actor: ArrivalActor, body: Record<string, unknown>) {
  const key = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : ''
  if (!KEY_RE.test(key)) throw new InputError('Clave de idempotencia inválida (8 a 100 caracteres).')
  const previous = await prisma.stockArrival.findUnique({ where: { tenantId_idempotencyKey: { tenantId: actor.tenantId, idempotencyKey: key } } })
  if (previous) return { arrival: await viewArrival(actor, previous, false), created: false }

  const arrivedAt = new Date(String(body.arrivedAt ?? ''))
  if (Number.isNaN(arrivedAt.getTime())) throw new InputError('Fecha de llegada inválida.')
  const currency = body.currency === 'USD' || body.currency === 'PYG' ? body.currency : null
  if (!currency) throw new InputError('Moneda inválida: USD o PYG.')
  let rate: number | null = null
  if (currency === 'USD') {
    rate = Number(body.exchangeRatePyg)
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100000) throw new InputError('Indicá la cotización USD → Gs.')
  }
  const source = body.source === 'IMPORT_INICIAL' ? 'IMPORT_INICIAL' : body.source === undefined || body.source === 'PEGADO' ? 'PEGADO' : null
  if (!source) throw new InputError('Origen inválido.')
  const ids = (value: unknown, label: string) => {
    if (value === undefined || value === null) return []
    if (!Array.isArray(value) || value.length > 100 || value.some(item => typeof item !== 'string' || !item || item.length > 128)) throw new InputError(`${label} inválidos.`)
    return [...new Set(value as string[])]
  }
  const purchaseIds = ids(body.purchaseIds, 'Compras')
  const supplierIds = ids(body.supplierIds, 'Proveedores')
  const shipmentId = typeof body.shipmentId === 'string' && body.shipmentId.trim() ? body.shipmentId.trim().slice(0, 128) : null
  const branchId = (typeof body.branchId === 'string' && body.branchId.trim()) || actor.branchId || await primeraSucursal({ tenantId: actor.tenantId })
  if (!branchId) throw new InputError('No hay sucursal para la llegada.')
  if (!canManageBranch(actor, branchId)) throw new InputError('No autorizado para esa sucursal.', 403)

  try {
    const created = await prisma.$transaction(async tx => {
      const branch = await tx.branch.findFirst({ where: { id: branchId, tenantId: actor.tenantId, isActive: true }, select: { id: true, name: true } })
      if (!branch) throw new InputError('Sucursal no encontrada.', 404)
      if (purchaseIds.length && (await tx.supplyPurchase.count({ where: { tenantId: actor.tenantId, id: { in: purchaseIds } } })) !== purchaseIds.length) throw new InputError('Compra no encontrada.', 404)
      if (supplierIds.length && (await tx.supplier.count({ where: { tenantId: actor.tenantId, id: { in: supplierIds } } })) !== supplierIds.length) throw new InputError('Proveedor no encontrado.', 404)
      if (shipmentId && !(await tx.supplyShipment.findFirst({ where: { id: shipmentId, tenantId: actor.tenantId }, select: { id: true } }))) throw new InputError('Envío no encontrado.', 404)
      const [{ n }] = await tx.$queryRaw<Array<{ n: bigint }>>`INSERT INTO "TenantSequence" ("tenantId", "key", "next") VALUES (${actor.tenantId}, 'arrival', 2)
        ON CONFLICT ("tenantId", "key") DO UPDATE SET "next" = "TenantSequence"."next" + 1 RETURNING "next" - 1 AS n`
      const code = `LLG-${branchSigla(branch.name)}-${String(n).padStart(4, '0')}`
      const row = await tx.stockArrival.create({
        data: {
          tenantId: actor.tenantId, branchId, code, arrivedAt, currency, source, exchangeRatePyg: rate,
          purchaseIds: purchaseIds.length ? purchaseIds : Prisma.DbNull, supplierIds: supplierIds.length ? supplierIds : Prisma.DbNull, shipmentId,
          idempotencyKey: key, createdById: actor.userId,
        },
      })
      await tx.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.userId, action: 'STOCK_ARRIVAL_CREATED', entity: 'StockArrival', entityId: row.id, metadata: { code, branchId, source, currency } } })
      return row
    })
    return { arrival: await viewArrival(actor, created, false), created: true }
  } catch (cause) {
    if ((cause as { code?: string })?.code === 'P2002') {
      const again = await prisma.stockArrival.findUnique({ where: { tenantId_idempotencyKey: { tenantId: actor.tenantId, idempotencyKey: key } } })
      if (again) return { arrival: await viewArrival(actor, again, false), created: false }
    }
    throw cause
  }
}

export async function listArrivals(actor: ArrivalActor, params: URLSearchParams) {
  const status = (params.get('status') || '').toUpperCase()
  const branchParam = params.get('branchId')
  const where: Prisma.StockArrivalWhereInput = {
    tenantId: actor.tenantId,
    ...(actor.role === 'ADMIN' ? (branchParam ? { branchId: branchParam } : {}) : { branchId: actor.branchId ?? '__none__' }),
    ...(['BORRADOR', 'CONFIRMADA', 'CANCELADA'].includes(status) ? { status: status as 'BORRADOR' } : {}),
  }
  const limit = Math.min(200, Math.max(1, Number(params.get('limit')) || 50))
  const rows = await prisma.stockArrival.findMany({ where, orderBy: [{ arrivedAt: 'desc' }, { createdAt: 'desc' }], take: limit, include: { _count: { select: { lines: true } }, branch: { select: { id: true, name: true } } } })
  return {
    arrivals: rows.map(({ _count, summary, exchangeRatePyg, ...row }) => ({
      ...row, exchangeRatePyg: actor.canSeeCost ? num(exchangeRatePyg) : null,
      lineCount: _count.lines, summary: redactSummary(summary as ArrivalSummary | null, actor.canSeeCost),
    })),
  }
}

export async function getArrival(actor: ArrivalActor, id: string) {
  return viewArrival(actor, await loadArrival(prisma, actor, id))
}

// ------------------------------------------------------- validación de líneas

type CheckLine = {
  id?: string; rowIndex: number; match: string; productId: string | null; serial: string | null; serialKind: string; destination: string
  destinationBranchId: string | null; supplierId: string | null; orderId: string | null; orderItemId: string | null; customerId: string | null
  issues: unknown
}

// Recalcula los hallazgos que dependen de la base (producto, serie existente,
// pedido, sucursal). Devuelve, por fila, los hallazgos nuevos (source 'check').
async function checkLines(db: Db, actor: ArrivalActor, arrival: { id: string; branchId: string }, lines: CheckLine[]): Promise<Map<number, StoredIssue[]>> {
  const out = new Map<number, StoredIssue[]>()
  const add = (line: CheckLine, code: string, severity: 'error' | 'warning', message: string) => {
    out.set(line.rowIndex, [...(out.get(line.rowIndex) ?? []), { code, severity, message, source: 'check' }])
  }
  const active = lines.filter(isActiveLine)
  const serials = [...new Set(active.map(line => line.serial).filter((s): s is string => Boolean(s)))]
  const [existing, otherDrafts] = await Promise.all([
    serials.length ? db.inventoryUnit.findMany({ where: { tenantId: actor.tenantId, serial: { in: serials } }, select: { serial: true } }) : [],
    serials.length ? db.stockArrivalLine.findMany({ where: { tenantId: actor.tenantId, serial: { in: serials }, arrivalId: { not: arrival.id }, arrival: { status: 'BORRADOR' } }, select: { serial: true } }) : [],
  ])
  const inInventory = new Set(existing.map(item => item.serial.toUpperCase()))
  const inOtherDraft = new Set(otherDrafts.map(item => String(item.serial).toUpperCase()))
  const count = new Map<string, number>()
  for (const line of active) if (line.serial) count.set(line.serial.toUpperCase(), (count.get(line.serial.toUpperCase()) ?? 0) + 1)

  const productIds = [...new Set(active.map(line => line.productId).filter((id): id is string => Boolean(id)))]
  const validProducts = new Set((productIds.length ? await db.product.findMany({ where: { tenantId: actor.tenantId, branchId: arrival.branchId, isActive: true, id: { in: productIds } }, select: { id: true } }) : []).map(item => item.id))
  const branchIds = [...new Set(active.map(line => line.destinationBranchId).filter((id): id is string => Boolean(id)))]
  const validBranches = new Set((branchIds.length ? await db.branch.findMany({ where: { tenantId: actor.tenantId, isActive: true, id: { in: branchIds } }, select: { id: true } }) : []).map(item => item.id))
  const itemIds = [...new Set(active.map(line => line.orderItemId).filter((id): id is string => Boolean(id)))]
  const orderIds = [...new Set(active.map(line => line.orderId).filter((id): id is string => Boolean(id)))]
  const customerIds = [...new Set(active.map(line => line.customerId).filter((id): id is string => Boolean(id)))]
  const [orders, orderItems, customers] = await Promise.all([
    orderIds.length ? db.order.findMany({ where: { tenantId: actor.tenantId, id: { in: orderIds } }, select: { id: true, status: true } }) : [],
    itemIds.length ? db.orderItem.findMany({ where: { id: { in: itemIds }, order: { tenantId: actor.tenantId } }, select: { id: true, orderId: true, productId: true, serialsPending: true } }) : [],
    customerIds.length ? db.customer.findMany({ where: { tenantId: actor.tenantId, id: { in: customerIds } }, select: { id: true } }) : [],
  ])
  const orderById = new Map(orders.map(item => [item.id, item]))
  const itemById = new Map(orderItems.map(item => [item.id, item]))
  const customerOk = new Set(customers.map(item => item.id))
  const perItem = new Map<string, number>()

  for (const line of active) {
    const serialNeeded = line.destination !== 'FALTA_IMEI' && line.destination !== 'DEVOLVER'
    if (!line.productId) add(line, 'PRODUCTO_NO_ENCONTRADO', 'error', 'Elegí el producto de la fila')
    else if (!validProducts.has(line.productId)) add(line, 'PRODUCTO_INVALIDO', 'error', 'El producto no existe en esta sucursal')
    if (!line.supplierId) add(line, 'PROVEEDOR_FALTA', 'error', 'Falta el proveedor')
    if (line.serial) {
      const check = classifySerialInput(line.serial, { allowTrailingZeros: hasConfirmedSerial(line) })
      if (check.kind === 'INVALIDO') add(line, 'SERIAL_INVALIDO', 'error', check.message)
      if ((count.get(line.serial.toUpperCase()) ?? 0) > 1) add(line, 'DUPLICADO_EN_LOTE', 'error', `IMEI/serie repetido en la llegada (${line.serial})`)
      if (line.destination !== 'DEVOLVER' && inInventory.has(line.serial.toUpperCase())) add(line, 'SERIAL_EXISTENTE', 'error', `El IMEI/serie ${line.serial} ya está en el inventario`)
      if (inOtherDraft.has(line.serial.toUpperCase())) add(line, 'SERIAL_EN_OTRA_LLEGADA', 'warning', `El IMEI/serie ${line.serial} figura en otra llegada en borrador`)
    } else if (serialNeeded) add(line, 'SERIAL_FALTA', 'error', 'Falta el IMEI/serie: usá el destino «Falta IMEI»')
    if (line.destination === 'OTRA_SUCURSAL') {
      if (!line.destinationBranchId) add(line, 'SUCURSAL_DESTINO_FALTA', 'error', 'Elegí la sucursal de destino')
      else if (line.destinationBranchId === arrival.branchId) add(line, 'SUCURSAL_DESTINO_IGUAL', 'error', 'La sucursal de destino es la misma de la llegada')
      else if (!validBranches.has(line.destinationBranchId)) add(line, 'SUCURSAL_DESTINO_INVALIDA', 'error', 'Sucursal de destino no encontrada')
    }
    const linked = line.orderId || line.orderItemId || line.customerId
    if (linked && line.destination !== 'STOCK') add(line, 'VINCULO_IGNORADO', 'warning', 'El vínculo a pedido/cliente solo aplica al destino «Stock»: se ignora')
    if (linked && line.destination === 'STOCK') {
      if (line.orderId && orderById.get(line.orderId)?.status !== 'PENDING' && orderById.get(line.orderId)?.status !== 'COMPLETED') add(line, 'PEDIDO_INVALIDO', 'error', 'El pedido no existe o está cancelado')
      if (line.customerId && !customerOk.has(line.customerId)) add(line, 'CLIENTE_INVALIDO', 'error', 'Cliente no encontrado')
      if (line.orderItemId) {
        const item = itemById.get(line.orderItemId)
        perItem.set(line.orderItemId, (perItem.get(line.orderItemId) ?? 0) + 1)
        if (!item || (line.orderId && item.orderId !== line.orderId)) add(line, 'PEDIDO_LINEA_INVALIDA', 'error', 'La línea del pedido no existe')
        else if (item.productId !== line.productId) add(line, 'PEDIDO_LINEA_OTRO_PRODUCTO', 'error', 'La línea del pedido es de otro producto')
        else if (item.serialsPending < (perItem.get(line.orderItemId) ?? 0)) add(line, 'PEDIDO_LINEA_SIN_PENDIENTE', 'error', 'La línea del pedido ya no espera más IMEI')
      }
    }
  }
  return out
}

const IMEI_CONFIRMADO = 'IMEI_CONFIRMADO'

// El operador confirmó este IMEI terminado en 000 (aviso guardado con la serie).
function hasConfirmedSerial(line: { serial: string | null; issues: unknown }) {
  return Boolean(line.serial) && issuesOf(line).some(issue => issue.code === IMEI_CONFIRMADO && issue.message.includes(String(line.serial)))
}

// Hallazgos finales de una línea: los del parser/conciliación que siguen
// vigentes + los recalculados contra la base.
function mergeIssues(line: { issues: unknown }, check: StoredIssue[], dropCodes: Set<string> = REGENERATED): StoredIssue[] {
  const kept = issuesOf(line).filter(issue => issue.source !== 'check' && !dropCodes.has(issue.code))
  return [...kept, ...check]
}

async function revalidate(db: Db, actor: ArrivalActor, arrival: { id: string; branchId: string }, dropByRow: Map<number, Set<string>> = new Map()) {
  const lines = await db.stockArrivalLine.findMany({ where: { arrivalId: arrival.id, tenantId: actor.tenantId }, orderBy: { rowIndex: 'asc' } })
  const checks = await checkLines(db, actor, arrival, lines)
  const regenerated = new Set(REGENERATED)
  for (const line of lines) {
    const drop = new Set([...regenerated, ...(dropByRow.get(line.rowIndex) ?? [])])
    const next = isActiveLine(line) ? mergeIssues(line, checks.get(line.rowIndex) ?? [], drop) : issuesOf(line).filter(issue => issue.severity !== 'error')
    if (JSON.stringify(next) !== JSON.stringify(line.issues)) await db.stockArrivalLine.update({ where: { id: line.id }, data: { issues: next as unknown as Prisma.InputJsonValue } })
  }
  return db.stockArrivalLine.findMany({ where: { arrivalId: arrival.id, tenantId: actor.tenantId }, orderBy: { rowIndex: 'asc' } })
}

// --------------------------------------------------------------- pegado

async function expectedFor(db: Db, actor: ArrivalActor, arrival: Awaited<ReturnType<typeof loadArrival>>) {
  const meta = new Map<string, { supplierId: string | null; unitCostPyg: number | null; originalUnitCost: number | null }>()
  const expected: ExpectedLine[] = []
  if (arrival.source === 'IMPORT_INICIAL') return { expected, meta }
  const used = async (lineIds: string[]) => {
    if (!lineIds.length) return new Map<string, number>()
    const [units, pending] = await Promise.all([
      db.inventoryUnit.groupBy({ by: ['purchaseLineId'], where: { tenantId: actor.tenantId, purchaseLineId: { in: lineIds }, removedAt: null }, _count: { _all: true } }),
      db.stockArrivalLine.groupBy({ by: ['purchaseLineId'], where: { tenantId: actor.tenantId, purchaseLineId: { in: lineIds }, unitId: null, destination: { in: ['DEVOLVER', 'FALTA_IMEI'] }, match: { not: 'NO_LLEGO' }, arrival: { status: 'CONFIRMADA' } }, _count: { _all: true } }),
    ])
    const out = new Map<string, number>()
    for (const row of [...units, ...pending]) if (row.purchaseLineId) out.set(row.purchaseLineId, (out.get(row.purchaseLineId) ?? 0) + row._count._all)
    return out
  }
  const taken = async (serials: string[]) => new Set((serials.length ? await db.inventoryUnit.findMany({ where: { tenantId: actor.tenantId, serial: { in: serials } }, select: { serial: true } }) : []).map(item => item.serial.toUpperCase()))

  if (arrival.shipmentId) {
    const shipment = await db.supplyShipment.findFirst({ where: { id: arrival.shipmentId, tenantId: actor.tenantId }, include: { purchase: { select: { id: true, supplierId: true } }, items: { where: { status: { notIn: ['RECIBIDO', 'FALTANTE'] } }, orderBy: { createdAt: 'asc' } } } })
    if (!shipment) return { expected, meta }
    const lines = await db.supplyPurchaseLine.findMany({ where: { tenantId: actor.tenantId, id: { in: shipment.items.map(item => item.lineId) } }, select: { id: true, condition: true, needId: true, unitCostPyg: true, originalUnitCost: true } })
    const lineById = new Map(lines.map(item => [item.id, item]))
    const already = await taken(shipment.items.map(item => item.serial).filter((s): s is string => Boolean(s)).map(s => s.toUpperCase()))
    for (const item of shipment.items) {
      const line = lineById.get(item.lineId)
      if (!line || (item.serial && already.has(item.serial.toUpperCase()))) continue
      meta.set(line.id, { supplierId: shipment.purchase.supplierId, unitCostPyg: num(line.unitCostPyg), originalUnitCost: num(line.originalUnitCost) })
      expected.push({ id: line.id, productId: item.productId, condition: line.condition as ExpectedLine['condition'], openQuantity: 1, serials: item.serial ? [item.serial] : [], createdAt: item.createdAt, purchaseId: shipment.purchase.id, needId: line.needId, shipmentItemId: item.id })
    }
    return { expected, meta }
  }

  const purchaseIds = Array.isArray(arrival.purchaseIds) ? (arrival.purchaseIds as string[]) : []
  const supplierIds = Array.isArray(arrival.supplierIds) ? (arrival.supplierIds as string[]) : []
  const purchases = await db.supplyPurchase.findMany({
    where: {
      tenantId: actor.tenantId, status: 'COMPRADA',
      ...(purchaseIds.length ? { id: { in: purchaseIds } } : { OR: [{ branchId: arrival.branchId }, { branchId: null }] }),
      ...(supplierIds.length ? { supplierId: { in: supplierIds } } : {}),
    },
    include: { lines: { include: { serials: { select: { serial: true } } } } }, orderBy: { createdAt: 'asc' }, take: 300,
  })
  const lineIds = purchases.flatMap(purchase => purchase.lines.map(line => line.id))
  const usedBy = await used(lineIds)
  const already = await taken(purchases.flatMap(purchase => purchase.lines.flatMap(line => line.serials.map(s => s.serial.toUpperCase()))))
  for (const purchase of purchases) {
    for (const line of purchase.lines) {
      const open = line.quantity - (usedBy.get(line.id) ?? 0)
      if (open <= 0) continue
      meta.set(line.id, { supplierId: purchase.supplierId, unitCostPyg: num(line.unitCostPyg), originalUnitCost: num(line.originalUnitCost) })
      expected.push({ id: line.id, productId: line.productId, condition: line.condition as ExpectedLine['condition'], openQuantity: open, serials: line.serials.map(s => s.serial.toUpperCase()).filter(s => !already.has(s)), createdAt: line.createdAt, purchaseId: purchase.id, needId: line.needId })
    }
  }
  return { expected, meta }
}

type Link = { orderId: string | null; orderItemId: string | null; customerId: string | null; issues: StoredIssue[] }

// «#32056» → ese pedido; «PEDIDO INARA» → el cliente (si es único) y su
// pedido pendiente con una línea que espera este modelo.
async function resolveLinks(db: Db, actor: ArrivalActor, row: ParsedRow, taken: Map<string, number>): Promise<Link> {
  const link: Link = { orderId: null, orderItemId: null, customerId: null, issues: [] }
  if (!row.productId) return link
  const pickItem = (items: Array<{ id: string; productId: string | null; serialsPending: number }>) =>
    items.find(item => item.productId === row.productId && item.serialsPending - (taken.get(item.id) ?? 0) > 0)
  const itemSelect = { select: { id: true, productId: true, serialsPending: true } } as const
  if (row.hints.orderNumber) {
    const orders = await db.order.findMany({ where: { tenantId: actor.tenantId, status: { not: 'CANCELLED' }, orderNumber: { endsWith: `#${row.hints.orderNumber}` } }, take: 3, select: { id: true, customerId: true, items: itemSelect } })
    if (orders.length === 1) {
      link.orderId = orders[0].id; link.customerId = orders[0].customerId
      const item = pickItem(orders[0].items)
      if (item) { link.orderItemId = item.id; taken.set(item.id, (taken.get(item.id) ?? 0) + 1) }
      else link.issues.push({ code: 'PEDIDO_SIN_LINEA_PENDIENTE', severity: 'warning', message: `El pedido #${row.hints.orderNumber} no tiene una línea esperando este modelo` })
    } else if (orders.length > 1) link.issues.push({ code: 'PEDIDO_AMBIGUO', severity: 'warning', message: `Hay varios pedidos que terminan en #${row.hints.orderNumber}: elegí uno` })
    else link.issues.push({ code: 'PEDIDO_NO_ENCONTRADO', severity: 'warning', message: `No se encontró el pedido #${row.hints.orderNumber}` })
    return link
  }
  const hint = row.hints.customerHint
  if (hint && hint.length >= 3) {
    const customers = await db.customer.findMany({ where: { tenantId: actor.tenantId, name: { contains: hint, mode: 'insensitive' } }, take: 4, select: { id: true } })
    if (customers.length === 1) {
      link.customerId = customers[0].id
      const orders = await db.order.findMany({ where: { tenantId: actor.tenantId, customerId: customers[0].id, status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'asc' }, take: 20, select: { id: true, items: itemSelect } })
      for (const order of orders) {
        const item = pickItem(order.items)
        if (item) { link.orderId = order.id; link.orderItemId = item.id; taken.set(item.id, (taken.get(item.id) ?? 0) + 1); break }
      }
    } else if (customers.length > 1) link.issues.push({ code: 'CLIENTE_AMBIGUO', severity: 'warning', message: `Hay varios clientes que coinciden con «${hint}»: elegí uno` })
    else link.issues.push({ code: 'CLIENTE_NO_ENCONTRADO', severity: 'warning', message: `No se encontró el cliente «${hint}»` })
  }
  return link
}

export async function parseArrival(actor: ArrivalActor, id: string, text: unknown) {
  if (typeof text !== 'string' || !text.trim()) throw new InputError('Pegá las filas de la llegada.')
  if (text.length > MAX_PASTE) throw new InputError('El pegado es demasiado grande.')
  const arrival = await loadArrival(prisma, actor, id)
  if (arrival.status !== 'BORRADOR') throw new InputError('La llegada ya no es un borrador.', 409)

  const [products, suppliers, branches] = await Promise.all([
    prisma.product.findMany({ where: { tenantId: actor.tenantId, branchId: arrival.branchId, isActive: true }, select: { id: true, name: true, model: true, color: true, capacity: true } }),
    prisma.supplier.findMany({ where: { tenantId: actor.tenantId, code: { not: null } }, select: { id: true, code: true } }),
    prisma.branch.findMany({ where: { tenantId: actor.tenantId, isActive: true, id: { not: arrival.branchId } }, select: { id: true, name: true } }),
  ])
  const parsed = parseArrivalPaste(text, {
    currency: arrival.currency as 'USD' | 'PYG',
    suppliers: suppliers.filter(item => item.code && item.code.trim()).map(item => ({ id: item.id, code: item.code as string })),
    matchProduct: createCatalogMatcher(products),
  })
  if (!parsed.rows.length) throw new InputError('No se reconoció ninguna fila en el pegado.')
  if (parsed.rows.length > MAX_ROWS) throw new InputError(`Hasta ${MAX_ROWS} filas por llegada.`)

  const { expected, meta } = await expectedFor(prisma, actor, arrival)
  const reconciled = reconcileArrival(parsed.rows, expected)
  const rate = num(arrival.exchangeRatePyg)
  const currency = arrival.currency as 'USD' | 'PYG'
  const supplierIds = Array.isArray(arrival.supplierIds) ? (arrival.supplierIds as string[]) : []
  const taken = new Map<string, number>()
  const data: Prisma.StockArrivalLineCreateManyInput[] = []

  for (const row of reconciled.rows as Array<MatchedRow<ParsedRow>>) {
    const base = { tenantId: actor.tenantId, arrivalId: arrival.id, rowIndex: row.rowIndex, match: row.match, purchaseLineId: row.purchaseLineId, shipmentItemId: row.shipmentItemId, needId: row.needId }
    if (row.synthetic) {
      const info = row.purchaseLineId ? meta.get(row.purchaseLineId) : undefined
      data.push({
        ...base, raw: { synthetic: true } as Prisma.InputJsonValue, productId: row.productId, serial: row.serial, serialKind: row.serialKind, condition: row.condition as ProductCondition | null,
        supplierId: info?.supplierId ?? null, originalCost: info?.originalUnitCost ?? null, costPyg: info?.unitCostPyg !== null && info?.unitCostPyg !== undefined ? BigInt(info.unitCostPyg) : null,
        destination: 'STOCK', issues: [{ code: 'NO_LLEGO', severity: 'warning', message: 'Estaba pedido y no llegó', source: 'parse' }] as unknown as Prisma.InputJsonValue,
      })
      continue
    }
    const info = row.purchaseLineId ? meta.get(row.purchaseLineId) : undefined
    const issues: StoredIssue[] = row.issues.map(issue => ({ ...issue, source: 'parse' as const }))
    if (arrival.source === 'IMPORT_INICIAL') {
      const at = issues.findIndex(issue => issue.code === 'SOBRANTE'); if (at >= 0) issues.splice(at, 1)
    }
    if (supplierIds.length && row.supplierId && !supplierIds.includes(row.supplierId)) issues.push({ code: 'PROVEEDOR_FUERA_DE_LOTE', severity: 'warning', message: 'El proveedor no está entre los de esta llegada', source: 'parse' })
    let destinationBranchId: string | null = null
    if (row.destination === 'OTRA_SUCURSAL') {
      const hint = normalizeText(row.hints.sendToBranchHint ?? '')
      const found = branches.filter(item => hint && normalizeText(item.name).includes(hint))
      if (found.length === 1) destinationBranchId = found[0].id
    }
    const link = row.match === 'NO_LLEGO' ? { orderId: null, orderItemId: null, customerId: null, issues: [] as StoredIssue[] } : await resolveLinks(prisma, actor, row, taken)
    issues.push(...link.issues.map(issue => ({ ...issue, source: 'parse' as const })))
    const cost = row.originalCost
    const fromPurchase = cost === null && info?.unitCostPyg
    data.push({
      ...base, raw: { cells: row.raw.cells, line: row.raw.line, blockDate: row.blockDate, blockLabel: row.blockLabel, modelText: row.modelText, hints: row.hints } as unknown as Prisma.InputJsonValue,
      productId: row.productId, serial: row.serial, serialKind: row.serialKind, condition: row.condition as ProductCondition,
      batteryPct: row.spec.batteryPct, batteryCycles: row.spec.batteryCycles, warrantyUntil: row.spec.warrantyUntil ? parseWarrantyUntil(row.spec.warrantyUntil) ?? null : null,
      supplierId: row.supplierId ?? info?.supplierId ?? null,
      originalCost: cost ?? (fromPurchase ? info?.originalUnitCost ?? null : null),
      costPyg: cost !== null ? costPygOf(currency, cost, rate) : fromPurchase ? BigInt(info!.unitCostPyg as number) : null,
      note: row.note, destination: row.destination as ArrivalDestination, destinationBranchId,
      orderId: link.orderId, orderItemId: link.orderItemId, customerId: link.customerId,
      issues: issues as unknown as Prisma.InputJsonValue,
    })
  }

  await prisma.$transaction(async tx => {
    const fresh = await tx.stockArrival.findFirst({ where: { id: arrival.id, tenantId: actor.tenantId }, select: { status: true } })
    if (fresh?.status !== 'BORRADOR') throw new InputError('La llegada ya no es un borrador.', 409)
    await tx.stockArrivalLine.deleteMany({ where: { arrivalId: arrival.id, tenantId: actor.tenantId } })
    await tx.stockArrivalLine.createMany({ data })
    await revalidate(tx, actor, arrival)
    await tx.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.userId, action: 'STOCK_ARRIVAL_PARSED', entity: 'StockArrival', entityId: arrival.id, metadata: { code: arrival.code, rows: parsed.rows.length, noLlegaron: reconciled.counts.NO_LLEGO, sobrantes: reconciled.counts.SOBRANTE } } })
  }, { timeout: 30000 })
  return { ...(await viewArrival(actor, arrival)), blocks: parsed.blocks, conciliacion: reconciled.counts, avisos: reconciled.warnings }
}

// --------------------------------------------------------------- editar línea

export async function patchLine(actor: ArrivalActor, arrivalId: string, body: Record<string, unknown>) {
  const lineId = typeof body.lineId === 'string' ? body.lineId : ''
  const arrival = await loadArrival(prisma, actor, arrivalId)
  if (arrival.status !== 'BORRADOR') throw new InputError('La llegada ya está confirmada: solo se puede completar el IMEI faltante.', 409)
  const line = await prisma.stockArrivalLine.findFirst({ where: { id: lineId, arrivalId: arrival.id, tenantId: actor.tenantId } })
  if (!line) throw new InputError('Línea no encontrada.', 404)
  const data: Prisma.StockArrivalLineUncheckedUpdateInput = {}
  const drop = new Set<string>()
  const optionalId = (key: string): string | null | undefined => {
    if (!(key in body)) return undefined
    const value = body[key]
    if (value === null || value === '') return null
    if (typeof value !== 'string' || value.length > 128) throw new InputError(`${key} inválido.`)
    return value
  }
  if ('productId' in body) {
    const productId = optionalId('productId')
    if (productId) {
      if (!(await prisma.product.findFirst({ where: { id: productId, tenantId: actor.tenantId, branchId: arrival.branchId, isActive: true }, select: { id: true } }))) throw new InputError('Producto no encontrado en la sucursal.', 404)
      drop.add('PRODUCTO_NO_ENCONTRADO'); drop.add('ELEGIR_PRODUCTO')
    }
    data.productId = productId ?? null
  }
  if ('serial' in body) {
    const serial = typeof body.serial === 'string' ? serialKey(body.serial) : ''
    data.serial = serial || null
    const confirm = body.confirmSerial === true
    if (serial) { const check = classifySerialInput(serial, { allowTrailingZeros: confirm }); data.serialKind = check.kind === 'IMEI' ? 'IMEI' : 'SERIE' } else data.serialKind = 'NINGUNO'
    drop.add('IMEI_EXCEL'); drop.add('IMEI_INVALIDO'); drop.add('FALTA_IMEI'); drop.add(IMEI_CONFIRMADO)
    // «El IMEI es correcto»: un IMEI real terminado en 000 que pasa Luhn baja de error a aviso.
    if (confirm && serial && classifySerialInput(serial, { allowTrailingZeros: true }).kind === 'IMEI' && /^\d{15}$/.test(serial.replace(/[\s-]+/g, '')) && /0{3,}$/.test(serial.replace(/[\s-]+/g, ''))) {
      data.issues = [...issuesOf(line).filter(issue => issue.code !== IMEI_CONFIRMADO), { code: IMEI_CONFIRMADO, severity: 'warning', message: `IMEI ${serial} termina en 000: confirmado por el operador`, source: 'parse' }] as unknown as Prisma.InputJsonValue
      drop.delete(IMEI_CONFIRMADO)
    }
    // Con serie cargada, una fila «Falta IMEI» pasa a ingresar al stock.
    if (serial && line.destination === 'FALTA_IMEI' && !('destination' in body)) data.destination = 'STOCK'
  }
  if ('destination' in body) {
    if (!(DESTINOS as readonly string[]).includes(String(body.destination))) throw new InputError('Destino inválido.')
    data.destination = body.destination as ArrivalDestination
  }
  const destinationBranchId = optionalId('destinationBranchId')
  if (destinationBranchId !== undefined) data.destinationBranchId = destinationBranchId
  const orderId = optionalId('orderId'); const orderItemId = optionalId('orderItemId'); const customerId = optionalId('customerId')
  if (orderId !== undefined) data.orderId = orderId
  if (customerId !== undefined) data.customerId = customerId
  if (orderItemId !== undefined) {
    data.orderItemId = orderItemId
    if (orderItemId && orderId === undefined) {
      const item = await prisma.orderItem.findFirst({ where: { id: orderItemId, order: { tenantId: actor.tenantId } }, select: { orderId: true } })
      if (item) data.orderId = item.orderId
    }
  } else if (orderId !== undefined && orderId !== line.orderId) data.orderItemId = null
  if ('note' in body) data.note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null
  if (!Object.keys(data).length) throw new InputError('No hay cambios para guardar.')

  await prisma.$transaction(async tx => {
    const fresh = await tx.stockArrival.findFirst({ where: { id: arrival.id, tenantId: actor.tenantId }, select: { status: true } })
    if (fresh?.status !== 'BORRADOR') throw new InputError('La llegada ya no es un borrador.', 409)
    await tx.stockArrivalLine.update({ where: { id: line.id }, data })
    await revalidate(tx, actor, arrival, new Map([[line.rowIndex, drop]]))
    await tx.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.userId, action: 'STOCK_ARRIVAL_LINE_EDITED', entity: 'StockArrival', entityId: arrival.id, metadata: { code: arrival.code, rowIndex: line.rowIndex, fields: Object.keys(data) } } })
  })
  return viewArrival(actor, arrival)
}

// ----------------------------------------------------------------- confirmar

type TxCtx = {
  actor: ArrivalActor
  arrival: { id: string; code: string; branchId: string; currency: 'USD' | 'PYG'; exchangeRatePyg: number | null; arrivedAt: Date }
  productCondition: Map<string, ProductCondition>
  techLocationId?: string
  customerNames: Map<string, string>
}

async function technicianLocation(tx: Prisma.TransactionClient, ctx: TxCtx) {
  if (ctx.techLocationId) return ctx.techLocationId
  const where = { tenantId: ctx.actor.tenantId, branchId: ctx.arrival.branchId, isActive: true }
  const found = await tx.stockLocation.findFirst({ where: { ...where, icon: 'TALLER' }, orderBy: { createdAt: 'asc' }, select: { id: true } })
    ?? await tx.stockLocation.findFirst({ where: { ...where, name: 'Técnico' }, select: { id: true } })
  ctx.techLocationId = found?.id ?? (await tx.stockLocation.create({ data: { tenantId: ctx.actor.tenantId, branchId: ctx.arrival.branchId, name: 'Técnico', icon: 'TALLER' }, select: { id: true } })).id
  return ctx.techLocationId
}

function unitFields(ctx: TxCtx, line: LineRow) {
  const condition = (line.condition ?? ctx.productCondition.get(line.productId as string) ?? 'NEW') as ProductCondition
  const raw = (line.raw ?? {}) as { blockDate?: string | null }
  const blockDate = raw.blockDate ? new Date(`${raw.blockDate}T00:00:00.000Z`) : null
  return {
    condition, supplierId: line.supplierId, batteryHealth: line.batteryPct, batteryCycles: line.batteryCycles, warrantyUntil: line.warrantyUntil,
    costPyg: line.costPyg, costCurrency: ctx.arrival.currency, originalCost: line.originalCost,
    exchangeRatePyg: ctx.arrival.currency === 'USD' ? ctx.arrival.exchangeRatePyg : null,
    purchasedAt: blockDate && !Number.isNaN(blockDate.getTime()) ? blockDate : ctx.arrival.arrivedAt,
    purchaseLineId: line.purchaseLineId, notes: line.note,
  }
}

type Landed = { unitId: string | null; kind: 'stock' | 'preSold' | 'reserved' | 'tecnico' | 'otra' | 'returned' | 'pending' }

// Materializa una línea según su destino efectivo. Devuelve la unidad creada.
async function landLine(tx: Prisma.TransactionClient, ctx: TxCtx, line: LineRow, destination: string): Promise<Landed> {
  const { actor, arrival } = ctx
  const productId = line.productId as string
  const serial = line.serial as string
  if (destination === 'DEVOLVER') {
    const purchase = line.purchaseLineId ? await tx.supplyPurchaseLine.findFirst({ where: { id: line.purchaseLineId, tenantId: actor.tenantId }, select: { purchaseId: true } }) : null
    const payable = purchase ? await tx.supplierPayable.findFirst({ where: { tenantId: actor.tenantId, supplyPurchaseId: purchase.purchaseId } }) : null
    const note = `Devolución al proveedor (${arrival.code}): ${line.serial ?? 'sin serie'}${line.costPyg !== null ? ` · Gs ${line.costPyg.toString()}` : ''}`
    if (payable) {
      await tx.supplierPayable.update({ where: { id: payable.id }, data: { notes: [payable.notes, note].filter(Boolean).join('\n').slice(0, 4000) } })
      await tx.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.userId, action: 'SUPPLIER_PAYABLE_RETURN_NOTED', entity: 'SupplierPayable', entityId: payable.id, metadata: { arrival: arrival.code, serial: line.serial, costPyg: num(line.costPyg) } } })
    }
    return { unitId: null, kind: 'returned' }
  }
  if (destination === 'FALTA_IMEI') return { unitId: null, kind: 'pending' }

  const fields = unitFields(ctx, line)
  const preSold = isPreSold({ destination, orderItemId: line.orderItemId, customerId: line.customerId })

  if (destination === 'TECNICO') {
    const locationId = await technicianLocation(tx, ctx)
    const notes = ['NO VENDER · en revisión técnica', line.note].filter(Boolean).join(' · ').slice(0, 500)
    // DEFECTIVE: no se ofrece a la venta ni cuenta como stock disponible.
    const unit = await tx.inventoryUnit.create({ data: { tenantId: actor.tenantId, productId, branchId: arrival.branchId, locationId, serial, ...fields, notes, status: 'DEFECTIVE' } })
    await promoteToEquipo(tx, actor.tenantId, productId)
    return { unitId: unit.id, kind: 'tecnico' }
  }

  if (preSold && line.orderItemId && line.orderId) {
    await attachSerialsToOrderItem(tx, { tenantId: actor.tenantId, orderId: line.orderId, orderItemId: line.orderItemId, serials: [serial], userId: actor.userId, condition: fields.condition, costPyg: line.costPyg, supplierId: line.supplierId })
    const unit = await tx.inventoryUnit.findFirstOrThrow({ where: { tenantId: actor.tenantId, serial }, select: { id: true } })
    // attach crea la unidad vendida con costo y proveedor; se completan la ficha y el origen.
    await tx.inventoryUnit.update({ where: { id: unit.id }, data: { batteryHealth: fields.batteryHealth, batteryCycles: fields.batteryCycles, warrantyUntil: fields.warrantyUntil, originalCost: fields.originalCost, costCurrency: fields.costCurrency, exchangeRatePyg: fields.exchangeRatePyg, purchasedAt: fields.purchasedAt, purchaseLineId: fields.purchaseLineId, notes: fields.notes } })
    return { unitId: unit.id, kind: 'preSold' }
  }

  const reserved = preSold && line.customerId
  const unit = await tx.inventoryUnit.create({
    data: {
      tenantId: actor.tenantId, productId, branchId: arrival.branchId, serial, ...fields,
      status: reserved ? 'RESERVED' : 'AVAILABLE',
      ...(reserved ? { reservationCustomer: ctx.customerNames.get(line.customerId as string) ?? null, reservationCustomerId: line.customerId, reservedById: actor.userId, reservationKind: 'CUSTOMER' as const } : {}),
    },
  })
  await changeStock(tx, { tenantId: actor.tenantId, productId, delta: 1, branchId: arrival.branchId, message: 'No se pudo sumar el stock de la llegada.' })
  await promoteToEquipo(tx, actor.tenantId, productId)
  if (destination === 'STOCK' && !reserved) await vincularAsignacionAlRecibir(tx, { tenantId: actor.tenantId, unit: { id: unit.id, serial }, userId: actor.userId })
  return { unitId: unit.id, kind: reserved ? 'reserved' : destination === 'OTRA_SUCURSAL' ? 'otra' : 'stock' }
}

async function markNeedsReceived(tx: Prisma.TransactionClient, actor: ArrivalActor, needIds: string[]) {
  for (const needId of new Set(needIds)) {
    const need = await tx.supplyNeed.findFirst({ where: { id: needId, tenantId: actor.tenantId, status: { notIn: ['RECIBIDA', 'CANCELADA'] } }, select: { id: true, quantity: true } })
    if (!need) continue
    const received = await tx.stockArrivalLine.count({ where: { tenantId: actor.tenantId, needId, unitId: { not: null } } })
    if (received >= need.quantity) await tx.supplyNeed.update({ where: { id: need.id }, data: { status: 'RECIBIDA' } })
  }
}

// Saldo abierto de las líneas de compra (bajo candado): pedidas − ingresadas − devueltas/pendientes.
async function lockedBalances(tx: Prisma.TransactionClient, actor: ArrivalActor, lineIds: string[]) {
  if (!lineIds.length) return new Map<string, number>()
  await tx.$queryRaw`SELECT "id" FROM "SupplyPurchaseLine" WHERE "tenantId" = ${actor.tenantId} AND "id" IN (${Prisma.join(lineIds)}) ORDER BY "id" FOR UPDATE`
  const [lines, units, pending] = await Promise.all([
    tx.supplyPurchaseLine.findMany({ where: { tenantId: actor.tenantId, id: { in: lineIds } }, select: { id: true, quantity: true } }),
    tx.inventoryUnit.groupBy({ by: ['purchaseLineId'], where: { tenantId: actor.tenantId, purchaseLineId: { in: lineIds }, removedAt: null }, _count: { _all: true } }),
    tx.stockArrivalLine.groupBy({ by: ['purchaseLineId'], where: { tenantId: actor.tenantId, purchaseLineId: { in: lineIds }, unitId: null, destination: { in: ['DEVOLVER', 'FALTA_IMEI'] }, match: { not: 'NO_LLEGO' }, arrival: { status: 'CONFIRMADA' } }, _count: { _all: true } }),
  ])
  const out = new Map(lines.map(line => [line.id, line.quantity]))
  for (const row of [...units, ...pending]) if (row.purchaseLineId) out.set(row.purchaseLineId, (out.get(row.purchaseLineId) ?? 0) - row._count._all)
  return out
}

async function arrivalContext(tx: Prisma.TransactionClient, actor: ArrivalActor, arrival: Awaited<ReturnType<typeof loadArrival>>, lines: LineRow[]): Promise<TxCtx> {
  const productIds = [...new Set(lines.map(line => line.productId).filter((id): id is string => Boolean(id)))]
  const customerIds = [...new Set(lines.map(line => line.customerId).filter((id): id is string => Boolean(id)))]
  const [products, customers] = await Promise.all([
    productIds.length ? tx.product.findMany({ where: { tenantId: actor.tenantId, id: { in: productIds } }, select: { id: true, condition: true } }) : [],
    customerIds.length ? tx.customer.findMany({ where: { tenantId: actor.tenantId, id: { in: customerIds } }, select: { id: true, name: true } }) : [],
  ])
  return {
    actor, arrival: { id: arrival.id, code: arrival.code, branchId: arrival.branchId, currency: arrival.currency as 'USD' | 'PYG', exchangeRatePyg: num(arrival.exchangeRatePyg), arrivedAt: arrival.arrivedAt },
    productCondition: new Map(products.map(item => [item.id, item.condition])), customerNames: new Map(customers.map(item => [item.id, item.name])),
  }
}

export async function confirmArrival(actor: ArrivalActor, id: string, idempotencyKey: string | null) {
  if (idempotencyKey !== null && !KEY_RE.test(idempotencyKey)) throw new InputError('Identificador de operación inválido.')
  const first = await loadArrival(prisma, actor, id)
  if (first.status === 'CONFIRMADA') return { ...(await viewArrival(actor, first)), repetida: true }
  if (first.status !== 'BORRADOR') throw new InputError('La llegada está cancelada.', 409)

  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "StockArrival" WHERE "id" = ${id} AND "tenantId" = ${actor.tenantId} FOR UPDATE`
    const arrival = await tx.stockArrival.findFirstOrThrow({ where: { id, tenantId: actor.tenantId } })
    if (arrival.status === 'CONFIRMADA') return { repetida: true }
    if (arrival.status !== 'BORRADOR') throw new InputError('La llegada está cancelada.', 409)

    const lines = await revalidate(tx, actor, arrival)
    if (!lines.length) throw new InputError('La llegada no tiene filas: pegá y conciliá primero.', 409)
    const blocking = lines.filter(line => isActiveLine(line) && hasError(issuesOf(line)))
    if (blocking.length) {
      throw new ArrivalBlocked(`La llegada tiene ${blocking.length} fila(s) con errores: corregilas antes de confirmar.`, {
        issues: blocking.map(line => ({ lineId: line.id, rowIndex: line.rowIndex, serial: line.serial, errors: issuesOf(line).filter(issue => issue.severity === 'error') })),
      })
    }

    // Saldos de las compras vigentes bajo candado: lo que llegó no puede superar lo abierto.
    const arrived = lines.filter(line => isActiveLine(line) && line.purchaseLineId)
    const need = new Map<string, number>()
    for (const line of arrived) need.set(line.purchaseLineId as string, (need.get(line.purchaseLineId as string) ?? 0) + 1)
    const balances = await lockedBalances(tx, actor, [...need.keys()])
    for (const [lineId, count] of need) {
      if (count > (balances.get(lineId) ?? 0)) throw new ArrivalBlocked('El saldo de una compra cambió: volvé a pegar y conciliar la llegada.', { purchaseLineId: lineId, llegaron: count, abierto: balances.get(lineId) ?? 0 })
    }

    const ctx = await arrivalContext(tx, actor, arrival, lines)
    const transfers = new Map<string, Map<string, string[]>>()
    const landedIds = new Map<string, Landed>()
    for (const line of lines) {
      if (!isActiveLine(line)) continue
      const landed = await landLine(tx, ctx, line, line.destination)
      landedIds.set(line.id, landed)
      await tx.stockArrivalLine.update({ where: { id: line.id }, data: { unitId: landed.unitId } })
      if (landed.unitId) {
        await tx.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.userId, action: 'INVENTORY_UNIT_RECEIVED', entity: 'InventoryUnit', entityId: landed.unitId, metadata: { serial: line.serial, productId: line.productId, branchId: arrival.branchId, arrival: arrival.code, destino: landed.kind } } })
      }
      if (line.shipmentItemId) await tx.supplyShipmentItem.updateMany({ where: { id: line.shipmentItemId, tenantId: actor.tenantId }, data: { status: 'RECIBIDO', ...(line.serial ? { serial: line.serial } : {}) } })
      if (landed.kind === 'otra' && line.destinationBranchId && line.productId) {
        const byProduct = transfers.get(line.destinationBranchId) ?? new Map<string, string[]>()
        byProduct.set(line.productId, [...(byProduct.get(line.productId) ?? []), line.serial as string])
        transfers.set(line.destinationBranchId, byProduct)
      }
    }
    for (const [toBranchId, byProduct] of transfers) {
      const transfer = await crearTraslado(tx, {
        tenantId: actor.tenantId, fromBranchId: arrival.branchId, toBranchId, userId: actor.userId,
        items: [...byProduct].map(([productId, serials]) => ({ productId, quantity: serials.length, serials })),
        note: `Llegada ${arrival.code}`, idempotencyKey: `arrival:${arrival.id}:${toBranchId}`,
      })
      const serials = new Set([...byProduct.values()].flat())
      await tx.stockArrivalLine.updateMany({ where: { arrivalId: arrival.id, tenantId: actor.tenantId, serial: { in: [...serials] }, destination: 'OTRA_SUCURSAL' }, data: { transferId: transfer.id } })
    }
    await markNeedsReceived(tx, actor, lines.filter(line => landedIds.get(line.id)?.unitId && line.needId).map(line => line.needId as string))

    const finalLines = await tx.stockArrivalLine.findMany({ where: { arrivalId: arrival.id, tenantId: actor.tenantId }, orderBy: { rowIndex: 'asc' } })
    const summary = summarizeArrival(finalLines.map(summaryLine), ctx.arrival.currency)
    await tx.stockArrival.update({ where: { id: arrival.id }, data: { status: 'CONFIRMADA', confirmedById: actor.userId, confirmedAt: new Date(), summary: summary as unknown as Prisma.InputJsonValue } })
    await tx.auditLog.create({
      data: {
        tenantId: actor.tenantId, userId: actor.userId, action: 'STOCK_ARRIVAL_CONFIRMED', entity: 'StockArrival', entityId: arrival.id,
        metadata: { code: arrival.code, branchId: arrival.branchId, ingresaron: summary.ingresaron, preVendidos: summary.preVendidos, aOtraSucursal: summary.aOtraSucursal, devueltos: summary.devueltos, tecnico: summary.tecnico, faltaImei: summary.faltaImei, noLlegaron: summary.noLlegaron, costUsd: summary.costUsd, costPyg: summary.costPyg, ...(idempotencyKey ? { idempotencyKey } : {}) },
      },
    })
    return { repetida: false }
  }, { timeout: 60000, maxWait: 15000 })

  return { ...(await viewArrival(actor, await loadArrival(prisma, actor, id))), repetida: result.repetida }
}

// ------------------------------------------------- completar IMEI faltante

export async function completeMissingSerial(actor: ArrivalActor, lineId: string, rawSerial: unknown, confirmSerial = false) {
  const serial = typeof rawSerial === 'string' ? serialKey(rawSerial) : ''
  const check = serial ? classifySerialInput(serial, { allowTrailingZeros: confirmSerial }) : null
  if (!check) throw new InputError('Indicá el IMEI o la serie.')
  if (check.kind === 'INVALIDO') throw new InputError(check.message)

  const line0 = await prisma.stockArrivalLine.findFirst({ where: { id: lineId, tenantId: actor.tenantId }, select: { arrivalId: true } })
  if (!line0) throw new InputError('Línea no encontrada.', 404)
  const arrival0 = await loadArrival(prisma, actor, line0.arrivalId)
  if (arrival0.status !== 'CONFIRMADA') throw new InputError('La llegada todavía es un borrador: editá la línea desde el borrador.', 409)

  const unitId = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "StockArrival" WHERE "id" = ${arrival0.id} AND "tenantId" = ${actor.tenantId} FOR UPDATE`
    const line = await tx.stockArrivalLine.findFirstOrThrow({ where: { id: lineId, tenantId: actor.tenantId } })
    if (line.destination !== 'FALTA_IMEI' || line.unitId) throw new InputError('Esa línea no espera un IMEI.', 409)
    if (!line.productId || !line.supplierId) throw new InputError('La línea no tiene producto o proveedor.', 409)
    if (await tx.inventoryUnit.findFirst({ where: { tenantId: actor.tenantId, serial: check.value }, select: { id: true } })) throw new ArrivalBlocked(`El IMEI/serie ${check.value} ya está en el inventario.`, { serial: check.value })
    const withSerial = { ...line, serial: check.value, serialKind: check.kind }
    const ctx = await arrivalContext(tx, actor, arrival0, [withSerial])
    const landed = await landLine(tx, ctx, withSerial, 'STOCK')
    await tx.stockArrivalLine.update({ where: { id: line.id }, data: { serial: check.value, serialKind: check.kind, destination: 'STOCK', unitId: landed.unitId, issues: issuesOf(line).filter(issue => issue.code !== 'FALTA_IMEI') as unknown as Prisma.InputJsonValue } })
    if (line.shipmentItemId) await tx.supplyShipmentItem.updateMany({ where: { id: line.shipmentItemId, tenantId: actor.tenantId }, data: { serial: check.value } })
    if (landed.unitId) await tx.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.userId, action: 'INVENTORY_UNIT_RECEIVED', entity: 'InventoryUnit', entityId: landed.unitId, metadata: { serial: check.value, productId: line.productId, branchId: arrival0.branchId, arrival: arrival0.code, destino: landed.kind, completaImei: true } } })
    if (line.needId && landed.unitId) await markNeedsReceived(tx, actor, [line.needId])
    const all = await tx.stockArrivalLine.findMany({ where: { arrivalId: arrival0.id, tenantId: actor.tenantId }, orderBy: { rowIndex: 'asc' } })
    const summary = summarizeArrival(all.map(summaryLine), arrival0.currency as 'USD' | 'PYG')
    await tx.stockArrival.update({ where: { id: arrival0.id }, data: { summary: summary as unknown as Prisma.InputJsonValue } })
    await tx.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.userId, action: 'STOCK_ARRIVAL_SERIAL_COMPLETED', entity: 'StockArrival', entityId: arrival0.id, metadata: { code: arrival0.code, lineId, serial: check.value } } })
    return landed.unitId
  }, { timeout: 30000 })
  return { ...(await viewArrival(actor, await loadArrival(prisma, actor, arrival0.id))), unitId }
}

export const arrivalJson = json
