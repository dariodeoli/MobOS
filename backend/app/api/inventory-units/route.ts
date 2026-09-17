import { Prisma } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { InventoryUnitStatus, PaymentCurrency, ProductCondition } from '@prisma/client'
import { INVENTORY_REMOVED, INVENTORY_RESTORED, removedInventoryUnitIds } from '../../../lib/inventory'
import { serialKey } from '../../../lib/validation'
import { changeStock } from '../../../lib/stock'

const canSeeBranch = (role: string, assigned: string | null, branchId: string | null) => !['VENDEDOR', 'CAJERA'].includes(role) || assigned === branchId
const canManageBranch = (role: string, assigned: string | null, branchId: string) => role === 'ADMIN' || (role === 'GERENTE' && assigned === branchId)
const text = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) || null : null
const reason = (value: unknown) => typeof value === 'string' && value.trim().length >= 3 && value.trim().length <= 500 ? value.trim() : null

async function removedIdsForTenant(tenant: string) {
  const events = await prisma.auditLog.findMany({
    where: { tenantId: tenant, entity: 'InventoryUnit', action: { in: [INVENTORY_REMOVED, INVENTORY_RESTORED] } },
    select: { entityId: true, action: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 5000,
  })
  return removedInventoryUnitIds(events)
}

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
  const view = params.get('view') || 'active'
  if (!['active', 'removed', 'all'].includes(view)) return error('Vista de inventario inválida.')
  // No revelar qué se retiró a gerentes, cajeras o vendedores. Devolver una
  // colección vacía permite que el panel común siga cargando sin filtrar datos.
  if (view === 'removed' && session.user.role !== 'ADMIN') return json([])
  const raw = (params.get('q') || '').replace(/^MOBOS:/i, '')
  const query = raw ? serialKey(raw) : ''
  const removedIds = await removedIdsForTenant(tenant)
  const removalFilter = view === 'removed'
    ? { id: { in: [...removedIds] } }
    : view === 'active' && removedIds.size
      ? { id: { notIn: [...removedIds] } }
      : {}
  const units = await prisma.inventoryUnit.findMany({
    where: { tenantId: tenant, ...removalFilter, ...(branchId ? { branchId } : session.user.branchId ? { branchId: session.user.branchId } : {}), ...(query ? { OR: [{ serial: { contains: query, mode: 'insensitive' } }, { product: { sku: { contains: query, mode: 'insensitive' } } }, { product: { name: { contains: raw, mode: 'insensitive' } } }] } : {}) },
    include: { product: { select: { id: true, name: true, sku: true, pricePyg: true, capacity: true } }, branch: { select: { id: true, name: true } }, location: { select: { id: true, name: true, code: true } }, lastVerifiedBy: { select: { id: true, name: true } }, ...(['ADMIN', 'GERENTE'].includes(session.user.role) ? { supplier: { select: { id: true, name: true, code: true } } } : {}) },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }], take: Math.min(500, Math.max(1, Number(params.get('limit')) || 500)), ...(params.get('cursor') ? { cursor: { id: params.get('cursor') as string }, skip: 1 } : {}),
  })
  // Una unidad vendida hereda la entrega de su pedido: Inventario puede así
  // distinguir lo que sigue en el local de lo que ya salió.
  const vendidas = units.filter(unit => unit.status === 'SOLD').map(unit => unit.serial)
  const ventas = vendidas.length
    ? await prisma.$queryRaw<Array<{ serial: string; orderId: string; orderNumber: string; fulfillmentStatus: string }>>`
        SELECT DISTINCT ON (s."serial") s."serial", o."id" AS "orderId", o."orderNumber", o."fulfillmentStatus"::text AS "fulfillmentStatus"
        FROM "OrderItemSerial" s
        JOIN "OrderItem" i ON i.id = s."orderItemId"
        JOIN "Order" o ON o.id = i."orderId"
        WHERE o."tenantId" = ${tenant} AND s."serial" IN (${Prisma.join(vendidas)})
        ORDER BY s."serial", o."createdAt" DESC
      `
    : []
  const ventaPorSerial = new Map(ventas.map(venta => [venta.serial, venta]))
  return json(units.map(unit => unit.status === 'SOLD' && ventaPorSerial.has(unit.serial)
    ? { ...unit, sale: ventaPorSerial.get(unit.serial) }
    : unit))
}

// Agrega una o más unidades físicas a un modelo existente. El stock agregado
// y los IMEI quedan en una misma transacción: no puede existir una unidad sin
// cantidad. `serial` conserva el flujo individual; `serials` admite lotes de
// hasta 100 unidades con la misma ficha de recepción.
export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE'].includes(session.user.role)) return error('No autorizado.', 403)
  let body: any; try { body = await request.json() } catch { return error('JSON inválido.') }
  const productId = text(body.productId, 128)
  const rawSerials: unknown[] = Array.isArray(body.serials) && body.serials.length ? body.serials : (body.serial !== undefined ? [body.serial] : [])
  const serials = rawSerials.map(value => typeof value === 'string' ? serialKey(value) : '').filter(Boolean)
  if (!productId || serials.length === 0) return error('Modelo e IMEI/serial son obligatorios.')
  if (serials.length > 100) return error('Hasta 100 unidades por recepción.')
  if (new Set(serials).size !== serials.length) return error('Hay IMEI/seriales repetidos en la lista.')
  const branchId = text(body.branchId, 128)
  if (!branchId || !canManageBranch(session.user.role, session.user.branchId, branchId)) return error('No autorizado para esa sucursal.', 403)
  const locationId = body.locationId === undefined || body.locationId === '' || body.locationId === null ? null : text(body.locationId, 128)
  try {
    const created = await prisma.$transaction(async tx => {
      const product = await tx.product.findFirst({ where: { id: productId, tenantId: tenant, branchId, isActive: true }, select: { id: true, condition: true } })
      if (!product) throw new Error('El modelo no pertenece a esa sucursal.')
      const existing = await tx.inventoryUnit.findMany({ where: { tenantId: tenant, serial: { in: serials } }, select: { serial: true } })
      if (existing.length) throw new Error(`Ya existen: ${existing.map(item => item.serial).join(', ')}.`)
      if (locationId && !(await tx.stockLocation.findFirst({ where: { id: locationId, tenantId: tenant, branchId, isActive: true }, select: { id: true } }))) throw new Error('Ubicación no encontrada para esa sucursal.')
      const data = unitData(body)
      // Proveedor estructurado: por id o resolviendo la abreviatura/nombre.
      let supplierId = body.supplierId === undefined || body.supplierId === '' || body.supplierId === null ? null : text(body.supplierId, 128)
      if (supplierId && !(await tx.supplier.findFirst({ where: { id: supplierId, tenantId: tenant }, select: { id: true } }))) throw new Error('Proveedor no encontrado.')
      if (!supplierId && typeof body.supplierName === 'string' && body.supplierName.trim()) {
        const byName = await tx.supplier.findFirst({ where: { tenantId: tenant, OR: [{ code: body.supplierName.trim() }, { name: body.supplierName.trim() }] }, select: { id: true } })
        supplierId = byName?.id ?? null
      }
      const units = []
      for (const serial of serials) {
        units.push(await tx.inventoryUnit.create({ data: { tenantId: tenant, productId, branchId, locationId, serial, condition: product.condition, supplierId, ...data } }))
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_UNIT_RECEIVED', entity: 'InventoryUnit', entityId: units[units.length - 1].id, metadata: { serial, productId, branchId, locationId } } })
      }
      await changeStock(tx, { tenantId: tenant, productId, delta: units.length })
      return units
    })
    return json(serials.length === 1 ? created[0] : { count: created.length, units: created }, { status: 201 })
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
  const action = body.action === undefined ? 'adjust' : body.action
  if (!['adjust', 'remove', 'restore', 'move'].includes(action)) return error('Acción de inventario inválida.')
  const adjustmentReason = reason(body.reason)
  if (['remove', 'restore'].includes(action) && !adjustmentReason) return error('Indicá un motivo de entre 3 y 500 caracteres.')
  try {
    const updated = await prisma.$transaction(async tx => {
      const before = await tx.inventoryUnit.findFirst({ where: { id, tenantId: tenant }, select: { id: true, branchId: true, status: true, serial: true, locationId: true, productId: true } })
      if (!before || !before.branchId) throw new Error('Unidad no encontrada.')
      if (!canManageBranch(session.user.role, session.user.branchId, before.branchId)) throw new Error('No autorizado para esa sucursal.')
      const removalEvents = await tx.auditLog.findMany({ where: { tenantId: tenant, entity: 'InventoryUnit', entityId: id, action: { in: [INVENTORY_REMOVED, INVENTORY_RESTORED] } }, select: { entityId: true, action: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
      const removed = removedInventoryUnitIds(removalEvents).has(id)
      // Mover de ubicación es una operación del día a día: no pide motivo de
      // ajuste, pero queda auditada igual.
      if (action === 'move') {
        if (removed) throw new Error('Restaurá la unidad antes de moverla.')
        const destino = body.locationId === undefined || body.locationId === '' || body.locationId === null ? null : text(body.locationId, 128)
        if (!destino) throw new Error('Elegí la ubicación de destino.')
        if (!(await tx.stockLocation.findFirst({ where: { id: destino, tenantId: tenant, branchId: before.branchId, isActive: true }, select: { id: true } }))) throw new Error('Ubicación no encontrada para esa sucursal.')
        const data = await tx.inventoryUnit.update({ where: { id }, data: { locationId: destino } })
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_UNIT_MOVED', entity: 'InventoryUnit', entityId: id, metadata: { serial: before.serial, from: before.locationId, to: destino } } })
        return data
      }
      if (action === 'remove') {
        if (removed) throw new Error('La unidad ya fue eliminada de forma recuperable.')
        if (before.status !== 'AVAILABLE') throw new Error('Solo se puede eliminar una unidad disponible. Liberá reservas o completá el flujo correspondiente.')
        await changeStock(tx, { tenantId: tenant, productId: before.productId, delta: -1, message: 'El stock cambió mientras se eliminaba la unidad.' })
        const data = await tx.inventoryUnit.update({ where: { id }, data: { status: 'DEFECTIVE', reservedUntil: null, reservationCustomer: null, reservedById: null } })
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: INVENTORY_REMOVED, entity: 'InventoryUnit', entityId: id, metadata: { serial: before.serial, reason: adjustmentReason, statusBefore: before.status, locationId: before.locationId } } })
        return data
      }
      if (action === 'restore') {
        if (session.user.role !== 'ADMIN') throw new Error('Solo un administrador general puede restaurar inventario eliminado.')
        if (!removed) throw new Error('La unidad no está en eliminados recuperables.')
        await changeStock(tx, { tenantId: tenant, productId: before.productId, delta: 1, message: 'No se pudo restaurar el stock de la unidad.' })
        const data = await tx.inventoryUnit.update({ where: { id }, data: { status: 'AVAILABLE', reservedUntil: null, reservationCustomer: null, reservedById: null } })
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: INVENTORY_RESTORED, entity: 'InventoryUnit', entityId: id, metadata: { serial: before.serial, reason: adjustmentReason, restoredTo: 'AVAILABLE', locationId: before.locationId } } })
        return data
      }
      if (!adjustmentReason) throw new Error('Indicá un motivo de ajuste de entre 3 y 500 caracteres.')
      if (removed) throw new Error('Restaurá la unidad antes de ajustarla.')
      const locationId = body.locationId === undefined ? undefined : body.locationId === '' || body.locationId === null ? null : text(body.locationId, 128)
      if (locationId && !(await tx.stockLocation.findFirst({ where: { id: locationId, tenantId: tenant, branchId: before.branchId, isActive: true }, select: { id: true } }))) throw new Error('Ubicación no encontrada para esa sucursal.')
      const requestedStatus = body.status === undefined ? undefined : Object.values(InventoryUnitStatus).includes(body.status) ? body.status : null
      if (requestedStatus === null || requestedStatus === 'RESERVED' || requestedStatus === 'SOLD' || (before.status === 'RESERVED' && requestedStatus !== undefined)) throw new Error('Ese estado se gestiona desde reserva o venta.')
      const data = await tx.inventoryUnit.update({ where: { id }, data: { ...unitData(body), ...(locationId !== undefined ? { locationId } : {}), ...(requestedStatus !== undefined ? { status: requestedStatus, ...(requestedStatus === 'AVAILABLE' ? { reservedUntil: null, reservationCustomer: null, reservedById: null } : {}) } : {}) } })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_UNIT_ADJUSTED', entity: 'InventoryUnit', entityId: id, metadata: { serial: before.serial, reason: adjustmentReason, before: { locationId: before.locationId, status: before.status }, after: { locationId: data.locationId, status: data.status } } } })
      return data
    })
    return json(updated)
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo actualizar la unidad.', 409) }
}
