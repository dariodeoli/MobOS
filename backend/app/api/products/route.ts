import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'

export async function GET(request: Request) {
  const tenant = tenantId(request); if (!tenant) return error('Falta x-tenant-id.', 401)
  const p = new URL(request.url).searchParams; const q = p.get('q') || ''
  const data = await prisma.product.findMany({ where: { tenantId: tenant, isActive: true, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }, { imei: { contains: q } }] } : {}) }, orderBy: { name: 'asc' }, take: 100 })
  return json(data)
}

export async function POST(request: Request) {
  const tenant = tenantId(request); if (!tenant) return error('Falta x-tenant-id.', 401)
  const b = await request.json(); if (!b.sku || !b.name) return error('SKU y nombre son obligatorios.')
  const data = await prisma.product.create({ data: { tenantId: tenant, sku: b.sku, name: b.name, category: b.category, imei: b.imei, condition: b.condition || 'NEW', pricePyg: Number(b.pricePyg || b.price || 0), stock: Number(b.stock || 0), branchId: b.branchId } })
  return json(data, { status: 201 })
}
