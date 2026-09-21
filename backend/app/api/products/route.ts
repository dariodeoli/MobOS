import { prisma } from '../../../lib/prisma'
import { PaymentCurrency, ProductCondition } from '@prisma/client'
import { error, json, tenantId } from '../../../lib/http'
import { canAccessAny, requireSession } from '../../../lib/auth'
import { ensureStoreBranch } from '../../../lib/store-branch'
import { skuUnico } from '../../../lib/sku'
import { serialKey } from '../../../lib/validation'
import { INVENTORY_UNIT_RECEIVED, liberarReservasVencidas } from '../../../lib/inventory'

// Variante estructurada: texto libre acotado; vacío se guarda como null.
const variantField = (value: unknown, max: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null



const unitDetails = (body: any, fallback: { condition: string; costPyg?: number }) => {
  const raw = body.unit || body
  const batteryHealth = raw.batteryHealth === undefined || raw.batteryHealth === null || raw.batteryHealth === '' ? null : Number(raw.batteryHealth)
  if (batteryHealth !== null && (!Number.isSafeInteger(batteryHealth) || batteryHealth < 0 || batteryHealth > 100)) throw new Error('La batería debe estar entre 0 y 100%.')
  const purchasedAt = raw.purchasedAt ? new Date(raw.purchasedAt) : null
  if (purchasedAt && Number.isNaN(purchasedAt.getTime())) throw new Error('Fecha de compra inválida.')
  const costCurrency: PaymentCurrency = raw.costCurrency === 'USD' ? PaymentCurrency.USD : PaymentCurrency.PYG
  const originalCost = raw.originalCost === undefined || raw.originalCost === null || raw.originalCost === '' ? null : Number(raw.originalCost)
  const exchangeRatePyg = raw.exchangeRatePyg === undefined || raw.exchangeRatePyg === null || raw.exchangeRatePyg === '' ? null : Number(raw.exchangeRatePyg)
  if (originalCost !== null && (!Number.isFinite(originalCost) || originalCost < 0)) throw new Error('Costo original inválido.')
  if (exchangeRatePyg !== null && (!Number.isFinite(exchangeRatePyg) || exchangeRatePyg <= 0)) throw new Error('Cotización inválida.')
  const costPyg = raw.costPyg === undefined || raw.costPyg === '' ? fallback.costPyg ?? null : Number(raw.costPyg)
  if (costPyg !== null && (!Number.isSafeInteger(costPyg) || costPyg < 0 || costPyg > 2147483647)) throw new Error('Costo en guaraníes inválido.')
  const condition: ProductCondition = Object.values(ProductCondition).includes(raw.condition) ? raw.condition : fallback.condition as ProductCondition
  return { condition, batteryHealth, supplierName: typeof raw.supplierName === 'string' && raw.supplierName.trim() ? raw.supplierName.trim().slice(0, 160) : null, purchasedAt, costPyg, costCurrency, originalCost, exchangeRatePyg, notes: typeof raw.unitNotes === 'string' ? raw.unitNotes.trim().slice(0, 500) || null : null }
}

export async function GET(request: Request) {
  const tenant = await tenantId(request); if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request); if (!session) return error('Sesión inválida.', 401)
  await prisma.$transaction(tx => liberarReservasVencidas(tx, tenant))
  const p = new URL(request.url).searchParams; const q = p.get('q') || ''
  const branchFilter = ['VENDEDOR', 'CAJERA'].includes(session.user.role) ? { OR: [{ branchId: session.user.branchId }, { branchId: null }] } : undefined
  const searchFilter = q ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { model: { contains: q, mode: 'insensitive' as const } }, { color: { contains: q, mode: 'insensitive' as const } }, { capacity: { contains: q, mode: 'insensitive' as const } }, { sku: { contains: q, mode: 'insensitive' as const } }, { imei: { contains: q } }] } : undefined
  // Paginado por cursor: el catálogo puede tener más de una pantalla y el
  // orden necesita un desempate estable (nombre no es único).
  const limit = Math.min(200, Math.max(1, Number(p.get('limit')) || 100))
  const cursor = p.get('cursor')
  const data = await prisma.product.findMany({
    where: { AND: [{ tenantId: tenant, isActive: true }, ...(branchFilter ? [branchFilter] : []), ...(searchFilter ? [searchFilter] : [])] },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })
  return json(data)
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request); if (!session) return error('Sesión inválida.', 401)
  if (!canAccessAny(session.user, ['products:manage'])) return error('No autorizado.', 403)
  const b = await request.json(); const price = Number(b.pricePyg ?? b.price ?? 0); const stock = Number(b.stock ?? 0)
  const cost = b.costPyg === undefined || b.costPyg === null || b.costPyg === '' ? undefined : Number(b.costPyg)
  const wholesalePricePyg = b.wholesalePricePyg === undefined || b.wholesalePricePyg === null || b.wholesalePricePyg === '' ? null : Number(b.wholesalePricePyg)
  const priceUsd = b.priceUsd === undefined || b.priceUsd === null || b.priceUsd === '' ? null : Number(b.priceUsd)
  if (priceUsd !== null && (!Number.isFinite(priceUsd) || priceUsd < 0 || priceUsd > 1000000000000)) throw new Error('Precio en USD inválido.')
  const warrantyDays = b.warrantyDays === undefined || b.warrantyDays === null || b.warrantyDays === '' ? null : Number(b.warrantyDays)
  if (warrantyDays !== null && (!Number.isSafeInteger(warrantyDays) || warrantyDays < 0 || warrantyDays > 730)) throw new Error('Los días de garantía deben estar entre 0 y 730.')
  const warrantyCoverage = typeof b.warrantyCoverage === 'string' && b.warrantyCoverage.trim() ? b.warrantyCoverage.trim().slice(0, 1000) : null
  const warrantyExclusions = typeof b.warrantyExclusions === 'string' && b.warrantyExclusions.trim() ? b.warrantyExclusions.trim().slice(0, 1000) : null
  if (wholesalePricePyg !== null && (!Number.isSafeInteger(wholesalePricePyg) || wholesalePricePyg < 0 || wholesalePricePyg > 2147483647)) throw new Error('Precio mayorista inválido.')
  const insuranceRate = b.insuranceRate === undefined || b.insuranceRate === null || b.insuranceRate === '' ? undefined : Number(b.insuranceRate)
  const reorderPoint = b.reorderPoint === undefined ? undefined : b.reorderPoint === null || b.reorderPoint === '' ? null : Number(b.reorderPoint)
  if (typeof b.sku !== 'string' || !b.sku.trim() || typeof b.name !== 'string' || !b.name.trim()) return error('SKU y nombre son obligatorios.')
  if (!Number.isSafeInteger(price) || price < 0 || price > 2147483647 || !Number.isSafeInteger(stock) || stock < 0 || stock > 2147483647) return error('Precio y stock deben ser enteros válidos.')
  if (cost !== undefined && (!Number.isSafeInteger(cost) || cost < 0 || cost > 2147483647)) return error('El costo debe ser un entero válido.')
  if (insuranceRate !== undefined && (!Number.isFinite(insuranceRate) || insuranceRate < 0 || insuranceRate > 100)) return error('El seguro debe ser un porcentaje entre 0 y 100.')
  if (reorderPoint !== undefined && reorderPoint !== null && (!Number.isSafeInteger(reorderPoint) || reorderPoint < 0 || reorderPoint > 2147483647)) return error('El umbral de reposición debe ser un entero válido.')
  const requestedBranchId: string | null = b.branchId || session.user.branchId || null
  const branchId = requestedBranchId ?? await ensureStoreBranch(session)
  if (branchId && !(await prisma.branch.findFirst({ where: { id: branchId, tenantId: tenant, isActive: true }, select: { id: true } }))) return error('Sucursal no encontrada.', 404)
  if (session.user.branchId && branchId !== session.user.branchId) return error('No autorizado para esa sucursal.', 403)
  const serial = serialKey(b.imei)
  if (serial && (stock !== 1 || !branchId)) return error('Un producto con IMEI/serial debe ingresar como una sola unidad en una sucursal.')
  const locationId = typeof b.locationId === 'string' && b.locationId.trim() ? b.locationId.trim() : null
  if (locationId && !serial) return error('La ubicación física se asigna a equipos con IMEI/serial.')
  try {
    const data = await prisma.$transaction(async tx => {
      if (serial && await tx.inventoryUnit.findFirst({ where: { tenantId: tenant, serial }, select: { id: true } })) throw new Error('Ese IMEI/serial ya existe.')
      if (locationId && !(await tx.stockLocation.findFirst({ where: { id: locationId, tenantId: tenant, branchId: branchId ?? '', isActive: true }, select: { id: true } }))) throw new Error('Ubicación no encontrada para esa sucursal.')
      const product = await tx.product.create({ data: { tenantId: tenant, sku: await skuUnico(tx, tenant, branchId, b.sku.trim()), name: b.name.trim(), category: b.category, model: variantField(b.model, 80), color: variantField(b.color, 60), capacity: variantField(b.capacity, 20), imei: serial || null, condition: b.condition || 'NEW', pricePyg: price, ...(wholesalePricePyg !== null ? { wholesalePricePyg } : {}), priceUsd, warrantyDays, warrantyCoverage, warrantyExclusions, costPyg: cost, insuranceRate, stock, branchId, ...(reorderPoint !== undefined ? { reorderPoint } : {}) } })
      if (serial) {
        const unit = await tx.inventoryUnit.create({ data: { tenantId: tenant, productId: product.id, branchId, locationId, serial, ...unitDetails(b, { condition: product.condition, costPyg: cost }) } })
        // La unidad serializada deja su alta en la cronología desde el primer día.
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: INVENTORY_UNIT_RECEIVED, entity: 'InventoryUnit', entityId: unit.id, metadata: { serial, productId: product.id, branchId, locationId, origin: 'alta-producto' } } })
      }
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'PRODUCT_CREATED', entity: 'Product', entityId: product.id, metadata: { name: product.name, sku: product.sku, pricePyg: product.pricePyg, costPyg: product.costPyg, stock: product.stock } } })
      return product
    })
    return json(data, { status: 201 })
  } catch (e) { return error(e instanceof Error ? e.message : 'No se pudo crear el producto.', 409) }
}

export async function PATCH(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['products:manage'])) return error('No autorizado.', 403)
  const b = await request.json(); if (!b.id) return error('Producto obligatorio.')
  const price = b.pricePyg === undefined ? undefined : Number(b.pricePyg); const stock = b.stock === undefined ? undefined : Number(b.stock)
  const cost = b.costPyg === undefined ? undefined : b.costPyg === null || b.costPyg === '' ? null : Number(b.costPyg)
  const insuranceRate = b.insuranceRate === undefined ? undefined : b.insuranceRate === null || b.insuranceRate === '' ? null : Number(b.insuranceRate)
  const reorderPoint = b.reorderPoint === undefined ? undefined : b.reorderPoint === null || b.reorderPoint === '' ? null : Number(b.reorderPoint)
  if ((price !== undefined && (!Number.isSafeInteger(price) || price < 0 || price > 2147483647)) || (stock !== undefined && (!Number.isSafeInteger(stock) || stock < 0 || stock > 2147483647))) return error('Precio y stock deben ser enteros válidos.')
  if (cost !== undefined && cost !== null && (!Number.isSafeInteger(cost) || cost < 0 || cost > 2147483647)) return error('El costo debe ser un entero válido.')
  if (insuranceRate !== undefined && insuranceRate !== null && (!Number.isFinite(insuranceRate) || insuranceRate < 0 || insuranceRate > 100)) return error('El seguro debe ser un porcentaje entre 0 y 100.')
  if (reorderPoint !== undefined && reorderPoint !== null && (!Number.isSafeInteger(reorderPoint) || reorderPoint < 0 || reorderPoint > 2147483647)) return error('El umbral de reposición debe ser un entero válido.')
  const product = await prisma.product.findFirst({ where: { id: b.id, tenantId: tenant, isActive: true } })
  if (!product) return error('Producto no encontrado.', 404)
  const userBranchId = session.user.branchId ?? await ensureStoreBranch(session)
  if ((userBranchId === null && product.branchId !== null) || (userBranchId && product.branchId !== null && product.branchId !== userBranchId)) return error('No autorizado para esa sucursal.', 403)
  const serial = b.imei === undefined ? undefined : serialKey(b.imei)
  if (serial !== undefined && (!serial || stock !== undefined && stock !== 1 || product.stock !== 1 || !product.branchId)) return error('El IMEI/serial solo se asigna a una unidad individual con stock 1.')
  // Cambiar el SKU a uno ya usado en la sucursal chocaría con el índice único:
  // se avisa antes en vez de devolver el error crudo de Prisma.
  if (typeof b.sku === 'string' && b.sku.trim() && b.sku.trim() !== product.sku) {
    const repetido = await prisma.product.findFirst({ where: { tenantId: tenant, branchId: product.branchId, sku: b.sku.trim(), id: { not: product.id } }, select: { id: true } })
    if (repetido) return error('Ya existe otro producto con ese SKU en la sucursal.', 409)
  }
  try {
    const data = await prisma.$transaction(async tx => {
      if (serial !== undefined) {
        const existing = await tx.inventoryUnit.findFirst({ where: { tenantId: tenant, serial }, select: { productId: true } })
        if (existing && existing.productId !== product.id) throw new Error('Ese IMEI/serial ya existe.')
        const details = unitDetails(b, { condition: product.condition, costPyg: product.costPyg ?? undefined })
        const locationId = b.locationId === undefined ? undefined : typeof b.locationId === 'string' && b.locationId.trim() ? b.locationId.trim() : null
        if (locationId && (!product.branchId || !(await tx.stockLocation.findFirst({ where: { id: locationId, tenantId: tenant, branchId: product.branchId, isActive: true }, select: { id: true } })))) throw new Error('Ubicación no encontrada para esa sucursal.')
        if (!existing) await tx.inventoryUnit.create({ data: { tenantId: tenant, productId: product.id, branchId: product.branchId, locationId: locationId ?? null, serial, ...details } })
        else await tx.inventoryUnit.update({ where: { tenantId_serial: { tenantId: tenant, serial } }, data: { ...details, ...(locationId !== undefined ? { locationId } : {}) } })
      }
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'PRODUCT_UPDATED', entity: 'Product', entityId: product.id, metadata: { name: typeof b.name === 'string' && b.name.trim() ? b.name.trim() : product.name, pricePyg: price ?? product.pricePyg, costPyg: cost ?? product.costPyg, condition: b.condition ?? product.condition, stock: stock ?? product.stock, stockBefore: product.stock, ...(typeof b.sku === 'string' && b.sku.trim() ? { sku: b.sku.trim() } : {}), ...(reorderPoint !== undefined ? { reorderPoint } : {}), ...(serial !== undefined ? { imei: serial } : {}) } } })
      return tx.product.update({ where: { id: product.id }, data: { ...(typeof b.name === 'string' && b.name.trim() ? { name: b.name.trim() } : {}), ...(typeof b.sku === 'string' && b.sku.trim() ? { sku: b.sku.trim() } : {}), ...(price !== undefined ? { pricePyg: price } : {}), ...(b.wholesalePricePyg !== undefined ? { wholesalePricePyg: b.wholesalePricePyg === null || b.wholesalePricePyg === '' ? null : Number(b.wholesalePricePyg) } : {}), ...(b.priceUsd !== undefined ? { priceUsd: b.priceUsd === null || b.priceUsd === '' ? null : Number(b.priceUsd) } : {}), ...(b.warrantyDays !== undefined ? { warrantyDays: b.warrantyDays === null || b.warrantyDays === '' ? null : Number(b.warrantyDays) } : {}), ...(b.warrantyCoverage !== undefined ? { warrantyCoverage: typeof b.warrantyCoverage === 'string' && b.warrantyCoverage.trim() ? b.warrantyCoverage.trim().slice(0, 1000) : null } : {}), ...(b.warrantyExclusions !== undefined ? { warrantyExclusions: typeof b.warrantyExclusions === 'string' && b.warrantyExclusions.trim() ? b.warrantyExclusions.trim().slice(0, 1000) : null } : {}), ...(cost !== undefined ? { costPyg: cost } : {}), ...(insuranceRate !== undefined ? { insuranceRate } : {}), ...(stock !== undefined ? { stock } : {}), ...(reorderPoint !== undefined ? { reorderPoint } : {}), ...(b.category !== undefined ? { category: b.category || null } : {}), ...(b.model !== undefined ? { model: variantField(b.model, 80) } : {}), ...(b.color !== undefined ? { color: variantField(b.color, 60) } : {}), ...(b.capacity !== undefined ? { capacity: variantField(b.capacity, 20) } : {}), ...(serial !== undefined ? { imei: serial } : {}), ...(b.condition !== undefined ? { condition: b.condition } : {}) } })
    })
    return json(data)
  } catch (e) { return error(e instanceof Error ? e.message : 'No se pudo actualizar el producto.', 409) }
}

export async function DELETE(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['products:manage'])) return error('No autorizado.', 403)
  const id = new URL(request.url).searchParams.get('id'); if (!id) return error('Producto obligatorio.')
  const product = await prisma.product.findFirst({ where: { id, tenantId: tenant, isActive: true } })
  if (!product) return error('Producto no encontrado.', 404)
  if ((session.user.branchId === null && product.branchId !== null) || (session.user.branchId && product.branchId !== session.user.branchId)) return error('No autorizado para esa sucursal.', 403)
  const data = await prisma.product.update({ where: { id: product.id }, data: { isActive: false } })
  await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'PRODUCT_DELETED', entity: 'Product', entityId: product.id, metadata: { name: product.name, sku: product.sku } } })
  return json({ id: data.id, isActive: data.isActive })
}
