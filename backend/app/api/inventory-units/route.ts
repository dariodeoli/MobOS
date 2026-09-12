import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { InventoryUnitStatus, PaymentCurrency, ProductCondition } from '@prisma/client'

const serialKey = (value: string) => value.trim().toUpperCase().replace(/[\s-]+/g, '')
const canSeeBranch = (role: string, assigned: string | null, branchId: string | null) => !['VENDEDOR', 'CAJERA'].includes(role) || assigned === branchId
const canManageBranch = (role: string, assigned: string | null, branchId: string) => role === 'ADMIN' || (role === 'GERENTE' && assigned === branchId)
const text = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) || null : null

function unitData(body: any) {
  const condition = body.condition === undefined ? undefined : Object.values(ProductCondition).includes(body.condition) ? body.condition : null
  if (condition === null) throw new Error('Condición de unidad inválida.')
  const batteryHealth = body.batteryHealth === undefined || body.batteryHealth === '' || body.batteryHealth === null ? undefined : Number(body.batteryHealth)
  if (batteryHealth !== undefined && (!Number.isSafeInteger(batteryHealth) || batteryHealth < 0 || batteryHealth > 100)) throw new Error('La batería debe estar entre 0 y 100%.')
  const costPyg = body.costPyg === undefined || body.costPyg === '' || body.costPyg === null ? undefined : Number(body.costPyg)
  if (costPyg !== undefined && (!Number.isSafeInteger(costPyg) || costPyg < 0 || costPyg > 2147483647)) throw new Error('Costo en guaraníes inválido.')
  const originalCost = body.originalCost === undefined || body.originalCost === '' || body.originalCost === null ? undefined : Number(body.originalCost)
  if (originalCost !== undefined && (!Number.isFinite(originalCost) || originalCost < 0)) throw new Error('Costo original inválido.')
  const exchangeRatePyg = body.exchangeRatePyg === undefined || body.exchangeRatePyg === '' || body.exchangeRatePyg === null ? undefined : Number(body.exchangeRatePyg)
  if (exchangeRatePyg !== undefined && (!Number.isFinite(exchangeRatePyg) || exchangeRatePyg <= 0)) throw new Error('Cotización inválida.')
  const purchasedAt = body.purchasedAt === undefined || body.purchasedAt === '' || body.purchasedAt === null ? undefined : new Date(body.purchasedAt)
  if (purchasedAt && Number.isNaN(purchasedAt.getTime())) throw new Error('Fecha de compra inválida.')
  const costCurrency = body.costCurrency === undefined ? undefined : Object.values(PaymentCurrency).includes(body.costCurrency) ? body.costCurrency : null
  if (costCurrency === null) throw new Error('Moneda de costo inválida.')
  return {
    ...(condition !== undefined ? { condition } : {}),
    ...(batteryHealth !== undefined ? { batteryHealth } : {}),
    ...(costPyg !== undefined ? { costPyg } : {}),
    ...(originalCost !== undefined ? { originalCost } : {}),
    ...(exchangeRatePyg !== undefined ? { exchangeRatePyg } : {}),
    ...(purchasedAt !== undefined ? { purchasedAt } : {}),
    ...(costCurrency !== undefined ? { costCurrency } : {}),
    ...(body.supplierName !== undefined ? { supplierName: text(body.supplierName, 160) } : {}),
    ...(body.notes !== undefined ? { notes: text(body.notes, 500) } : {}),
  }
}

// Consulta diseñada para lectores: el escáner se comporta como teclado y puede
// enviar el IMEI completo, el SKU de un accesorio o el código MOBOS:<imei>.
export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const params = new URL(request.url).searchParams
  const branchId = params.get('branchId')
  if (branchId && !canSeeBranch(session.user.role, session.user.branchId, branchId)) return error('No autorizado para esa sucursal.', 403)
  const raw = (params.get('q') || '').replace(/^MOBOS:/i, '')
  const query = raw ? serialKey(raw) : ''
  const units = await prisma.inventoryUnit.findMany({
    where: { tenantId: tenant, ...(branchId ? { branchId } : session.user.branchId ? { branchId: session.user.branchId } : {}), ...(query ? { OR: [{ serial: { contains: query, mode: 'insensitive' } }, { product: { sku: { contains: query, mode: 'insensitive' } } }, { product: { name: { contains: raw, mode: 'insensitive' } } }] } : {}) },
    include: { product: { select: { id: true, name: true, sku: true, pricePyg: true } }, branch: { select: { id: true, name: true } }, location: { select: { id: true, name: true, code: true } } },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }], take: 100,
  })
  return json(units)
}

// Agrega una unidad física a un modelo existente. El stock agregado y el IMEI
// quedan en una misma transacción: no puede existir una unidad sin cantidad.
export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE'].includes(session.user.role)) return error('No autorizado.', 403)
  let body: any; try { body = await request.json() } catch { return error('JSON inválido.') }
  const productId = text(body.productId, 128); const serial = typeof body.serial === 'string' ? serialKey(body.serial) : ''
  if (!productId || !serial) return error('Modelo e IMEI/serial son obligatorios.')
  const branchId = text(body.branchId, 128)
  if (!branchId || !canManageBranch(session.user.role, session.user.branchId, branchId)) return error('No autorizado para esa sucursal.', 403)
  const locationId = body.locationId === undefined || body.locationId === '' || body.locationId === null ? null : text(body.locationId, 128)
  try {
    const created = await prisma.$transaction(async tx => {
      const product = await tx.product.findFirst({ where: { id: productId, tenantId: tenant, branchId, isActive: true }, select: { id: true, condition: true } })
      if (!product) throw new Error('El modelo no pertenece a esa sucursal.')
      if (await tx.inventoryUnit.findFirst({ where: { tenantId: tenant, serial }, select: { id: true } })) throw new Error('Ese IMEI/serial ya existe.')
      if (locationId && !(await tx.stockLocation.findFirst({ where: { id: locationId, tenantId: tenant, branchId, isActive: true }, select: { id: true } }))) throw new Error('Ubicación no encontrada para esa sucursal.')
      const unit = await tx.inventoryUnit.create({ data: { tenantId: tenant, productId, branchId, locationId, serial, condition: product.condition, ...unitData(body) } })
      await tx.product.update({ where: { id: productId }, data: { stock: { increment: 1 } } })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_UNIT_RECEIVED', entity: 'InventoryUnit', entityId: unit.id, metadata: { serial, productId, branchId, locationId } } })
      return unit
    })
    return json(created, { status: 201 })
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo ingresar la unidad.', 409) }
}

// Las correcciones físicas mantienen la misma unidad y dejan una auditoría.
// Los estados RESERVED/SOLD se controlan por sus flujos transaccionales propios.
export async function PATCH(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE'].includes(session.user.role)) return error('No autorizado.', 403)
  let body: any; try { body = await request.json() } catch { return error('JSON inválido.') }
  const id = text(body.id, 128)
  if (!id) return error('Unidad obligatoria.')
  try {
    const updated = await prisma.$transaction(async tx => {
      const before = await tx.inventoryUnit.findFirst({ where: { id, tenantId: tenant }, select: { id: true, branchId: true, status: true, serial: true, locationId: true } })
      if (!before || !before.branchId) throw new Error('Unidad no encontrada.')
      if (!canManageBranch(session.user.role, session.user.branchId, before.branchId)) throw new Error('No autorizado para esa sucursal.')
      const locationId = body.locationId === undefined ? undefined : body.locationId === '' || body.locationId === null ? null : text(body.locationId, 128)
      if (locationId && !(await tx.stockLocation.findFirst({ where: { id: locationId, tenantId: tenant, branchId: before.branchId, isActive: true }, select: { id: true } }))) throw new Error('Ubicación no encontrada para esa sucursal.')
      const requestedStatus = body.status === undefined ? undefined : Object.values(InventoryUnitStatus).includes(body.status) ? body.status : null
      if (requestedStatus === null || requestedStatus === 'RESERVED' || requestedStatus === 'SOLD' || (before.status === 'RESERVED' && requestedStatus !== undefined)) throw new Error('Ese estado se gestiona desde reserva o venta.')
      const data = await tx.inventoryUnit.update({ where: { id }, data: { ...unitData(body), ...(locationId !== undefined ? { locationId } : {}), ...(requestedStatus !== undefined ? { status: requestedStatus, ...(requestedStatus === 'AVAILABLE' ? { reservedUntil: null, reservationCustomer: null, reservedById: null } : {}) } : {}) } })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_UNIT_UPDATED', entity: 'InventoryUnit', entityId: id, metadata: { serial: before.serial, before: { locationId: before.locationId, status: before.status }, after: { locationId: data.locationId, status: data.status } } } })
      return data
    })
    return json(updated)
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo actualizar la unidad.', 409) }
}
