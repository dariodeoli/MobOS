import { prisma } from '../../../lib/prisma'
import { PaymentCurrency, ProductCondition } from '@prisma/client'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

const serialKey = (value: unknown) => typeof value === 'string' ? value.trim().toUpperCase().replace(/[\s-]+/g, '') : ''
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
  await prisma.inventoryUnit.updateMany({ where: { tenantId: tenant, status: 'RESERVED', reservedUntil: { lte: new Date() } }, data: { status: 'AVAILABLE', reservedUntil: null, reservationCustomer: null, reservedById: null } })
  const p = new URL(request.url).searchParams; const q = p.get('q') || ''
  const branchFilter = ['VENDEDOR', 'CAJERA'].includes(session.user.role) ? { OR: [{ branchId: session.user.branchId }, { branchId: null }] } : undefined
  const searchFilter = q ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { sku: { contains: q, mode: 'insensitive' as const } }, { imei: { contains: q } }] } : undefined
  const data = await prisma.product.findMany({ where: { AND: [{ tenantId: tenant, isActive: true }, ...(branchFilter ? [branchFilter] : []), ...(searchFilter ? [searchFilter] : [])] }, orderBy: { name: 'asc' }, take: 100 })
  return json(data)
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request); if (!session) return error('Sesión inválida.', 401)
  if (!['ADMIN', 'GERENTE'].includes(session.user.role)) return error('No autorizado.', 403)
  const b = await request.json(); const price = Number(b.pricePyg ?? b.price ?? 0); const stock = Number(b.stock ?? 0)
  const cost = b.costPyg === undefined || b.costPyg === null || b.costPyg === '' ? undefined : Number(b.costPyg)
  const insuranceRate = b.insuranceRate === undefined || b.insuranceRate === null || b.insuranceRate === '' ? undefined : Number(b.insuranceRate)
  if (typeof b.sku !== 'string' || !b.sku.trim() || typeof b.name !== 'string' || !b.name.trim()) return error('SKU y nombre son obligatorios.')
  if (!Number.isSafeInteger(price) || price < 0 || price > 2147483647 || !Number.isSafeInteger(stock) || stock < 0 || stock > 2147483647) return error('Precio y stock deben ser enteros válidos.')
  if (cost !== undefined && (!Number.isSafeInteger(cost) || cost < 0 || cost > 2147483647)) return error('El costo debe ser un entero válido.')
  if (insuranceRate !== undefined && (!Number.isFinite(insuranceRate) || insuranceRate < 0 || insuranceRate > 100)) return error('El seguro debe ser un porcentaje entre 0 y 100.')
  const branchId = b.branchId || session.user.branchId || null
  if (branchId && !(await prisma.branch.findFirst({ where: { id: branchId, tenantId: tenant, isActive: true }, select: { id: true } }))) return error('Sucursal no encontrada.', 404)
  if (session.user.branchId && branchId !== session.user.branchId) return error('No autorizado para esa sucursal.', 403)
  const serial = serialKey(b.imei)
  if (serial && (stock !== 1 || !branchId)) return error('Un producto con IMEI/serial debe ingresar como una sola unidad en una sucursal.')
  const locationId = typeof b.locationId === 'string' && b.locationId.trim() ? b.locationId.trim() : null
  if (locationId && !serial) return error('La ubicación física se asigna a equipos con IMEI/serial.')
  try {
    const data = await prisma.$transaction(async tx => {
      if (serial && await tx.inventoryUnit.findFirst({ where: { tenantId: tenant, serial }, select: { id: true } })) throw new Error('Ese IMEI/serial ya existe.')
      if (locationId && !(await tx.stockLocation.findFirst({ where: { id: locationId, tenantId: tenant, branchId, isActive: true }, select: { id: true } }))) throw new Error('Ubicación no encontrada para esa sucursal.')
      const product = await tx.product.create({ data: { tenantId: tenant, sku: b.sku.trim(), name: b.name.trim(), category: b.category, imei: serial || null, condition: b.condition || 'NEW', pricePyg: price, costPyg: cost, insuranceRate, stock, branchId } })
      if (serial) await tx.inventoryUnit.create({ data: { tenantId: tenant, productId: product.id, branchId, locationId, serial, ...unitDetails(b, { condition: product.condition, costPyg: cost }) } })
      return product
    })
    return json(data, { status: 201 })
  } catch (e) { return error(e instanceof Error ? e.message : 'No se pudo crear el producto.', 409) }
}

export async function PATCH(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE'].includes(session.user.role)) return error('No autorizado.', 403)
  const b = await request.json(); if (!b.id) return error('Producto obligatorio.')
  const price = b.pricePyg === undefined ? undefined : Number(b.pricePyg); const stock = b.stock === undefined ? undefined : Number(b.stock)
  const cost = b.costPyg === undefined ? undefined : b.costPyg === null || b.costPyg === '' ? null : Number(b.costPyg)
  const insuranceRate = b.insuranceRate === undefined ? undefined : b.insuranceRate === null || b.insuranceRate === '' ? null : Number(b.insuranceRate)
  if ((price !== undefined && (!Number.isSafeInteger(price) || price < 0 || price > 2147483647)) || (stock !== undefined && (!Number.isSafeInteger(stock) || stock < 0 || stock > 2147483647))) return error('Precio y stock deben ser enteros válidos.')
  if (cost !== undefined && cost !== null && (!Number.isSafeInteger(cost) || cost < 0 || cost > 2147483647)) return error('El costo debe ser un entero válido.')
  if (insuranceRate !== undefined && insuranceRate !== null && (!Number.isFinite(insuranceRate) || insuranceRate < 0 || insuranceRate > 100)) return error('El seguro debe ser un porcentaje entre 0 y 100.')
  const product = await prisma.product.findFirst({ where: { id: b.id, tenantId: tenant, isActive: true } })
  if (!product) return error('Producto no encontrado.', 404)
  if ((session.user.branchId === null && product.branchId !== null) || (session.user.branchId && product.branchId !== null && product.branchId !== session.user.branchId)) return error('No autorizado para esa sucursal.', 403)
  const serial = b.imei === undefined ? undefined : serialKey(b.imei)
  if (serial !== undefined && (!serial || stock !== undefined && stock !== 1 || product.stock !== 1 || !product.branchId)) return error('El IMEI/serial solo se asigna a una unidad individual con stock 1.')
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
      return tx.product.update({ where: { id: product.id }, data: { ...(typeof b.name === 'string' && b.name.trim() ? { name: b.name.trim() } : {}), ...(typeof b.sku === 'string' && b.sku.trim() ? { sku: b.sku.trim() } : {}), ...(price !== undefined ? { pricePyg: price } : {}), ...(cost !== undefined ? { costPyg: cost } : {}), ...(insuranceRate !== undefined ? { insuranceRate } : {}), ...(stock !== undefined ? { stock } : {}), ...(b.category !== undefined ? { category: b.category || null } : {}), ...(serial !== undefined ? { imei: serial } : {}), ...(b.condition !== undefined ? { condition: b.condition } : {}) } })
    })
    return json(data)
  } catch (e) { return error(e instanceof Error ? e.message : 'No se pudo actualizar el producto.', 409) }
}

export async function DELETE(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!['ADMIN', 'GERENTE'].includes(session.user.role)) return error('No autorizado.', 403)
  const id = new URL(request.url).searchParams.get('id'); if (!id) return error('Producto obligatorio.')
  const product = await prisma.product.findFirst({ where: { id, tenantId: tenant, isActive: true } })
  if (!product) return error('Producto no encontrado.', 404)
  if ((session.user.branchId === null && product.branchId !== null) || (session.user.branchId && product.branchId !== session.user.branchId)) return error('No autorizado para esa sucursal.', 403)
  const data = await prisma.product.update({ where: { id: product.id }, data: { isActive: false } })
  return json({ id: data.id, isActive: data.isActive })
}
