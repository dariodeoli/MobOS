import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

const serialKey = (value: unknown) => typeof value === 'string' ? value.trim().toUpperCase().replace(/[\s-]+/g, '') : ''

export async function GET(request: Request) {
  const tenant = await tenantId(request); if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request); if (!session) return error('Sesión inválida.', 401)
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
  if (typeof b.sku !== 'string' || !b.sku.trim() || typeof b.name !== 'string' || !b.name.trim()) return error('SKU y nombre son obligatorios.')
  if (!Number.isSafeInteger(price) || price < 0 || price > 2147483647 || !Number.isSafeInteger(stock) || stock < 0 || stock > 2147483647) return error('Precio y stock deben ser enteros válidos.')
  if (cost !== undefined && (!Number.isSafeInteger(cost) || cost < 0 || cost > 2147483647)) return error('El costo debe ser un entero válido.')
  const branchId = b.branchId || session.user.branchId || null
  if (branchId && !(await prisma.branch.findFirst({ where: { id: branchId, tenantId: tenant, isActive: true }, select: { id: true } }))) return error('Sucursal no encontrada.', 404)
  if (session.user.branchId && branchId !== session.user.branchId) return error('No autorizado para esa sucursal.', 403)
  const serial = serialKey(b.imei)
  if (serial && (stock !== 1 || !branchId)) return error('Un producto con IMEI/serial debe ingresar como una sola unidad en una sucursal.')
  try {
    const data = await prisma.$transaction(async tx => {
      if (serial && await tx.inventoryUnit.findFirst({ where: { tenantId: tenant, serial }, select: { id: true } })) throw new Error('Ese IMEI/serial ya existe.')
      const product = await tx.product.create({ data: { tenantId: tenant, sku: b.sku.trim(), name: b.name.trim(), category: b.category, imei: serial || null, condition: b.condition || 'NEW', pricePyg: price, costPyg: cost, stock, branchId } })
      if (serial) await tx.inventoryUnit.create({ data: { tenantId: tenant, productId: product.id, branchId, serial } })
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
  if ((price !== undefined && (!Number.isSafeInteger(price) || price < 0 || price > 2147483647)) || (stock !== undefined && (!Number.isSafeInteger(stock) || stock < 0 || stock > 2147483647))) return error('Precio y stock deben ser enteros válidos.')
  if (cost !== undefined && cost !== null && (!Number.isSafeInteger(cost) || cost < 0 || cost > 2147483647)) return error('El costo debe ser un entero válido.')
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
        if (!existing) await tx.inventoryUnit.create({ data: { tenantId: tenant, productId: product.id, branchId: product.branchId, serial } })
      }
      return tx.product.update({ where: { id: product.id }, data: { ...(typeof b.name === 'string' && b.name.trim() ? { name: b.name.trim() } : {}), ...(typeof b.sku === 'string' && b.sku.trim() ? { sku: b.sku.trim() } : {}), ...(price !== undefined ? { pricePyg: price } : {}), ...(cost !== undefined ? { costPyg: cost } : {}), ...(stock !== undefined ? { stock } : {}), ...(b.category !== undefined ? { category: b.category || null } : {}), ...(serial !== undefined ? { imei: serial } : {}), ...(b.condition !== undefined ? { condition: b.condition } : {}) } })
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
