import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

export async function GET(request: Request) {
  const tenant = await tenantId(request); if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request); if (!session) return error('Sesión inválida.', 401)
  const p = new URL(request.url).searchParams; const q = p.get('q') || ''
  const branchFilter = ['VENDEDOR', 'CAJERA'].includes(session.user.role) ? { branchId: session.user.branchId } : {}
  const data = await prisma.product.findMany({ where: { tenantId: tenant, isActive: true, ...branchFilter, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }, { imei: { contains: q } }] } : {}) }, orderBy: { name: 'asc' }, take: 100 })
  return json(data)
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request); if (!session) return error('Sesión inválida.', 401)
  if (!['ADMIN', 'GERENTE'].includes(session.user.role)) return error('No autorizado.', 403)
  const b = await request.json(); const price = Number(b.pricePyg ?? b.price ?? 0); const stock = Number(b.stock ?? 0)
  if (typeof b.sku !== 'string' || !b.sku.trim() || typeof b.name !== 'string' || !b.name.trim()) return error('SKU y nombre son obligatorios.')
  if (!Number.isInteger(price) || price < 0 || !Number.isInteger(stock) || stock < 0) return error('Precio y stock deben ser enteros no negativos.')
  if (b.branchId && !(await prisma.branch.findFirst({ where: { id: b.branchId, tenantId: tenant, isActive: true }, select: { id: true } }))) return error('Sucursal no encontrada.', 404)
  const data = await prisma.product.create({ data: { tenantId: tenant, sku: b.sku.trim(), name: b.name.trim(), category: b.category, imei: b.imei, condition: b.condition || 'NEW', pricePyg: price, stock, branchId: b.branchId } })
  return json(data, { status: 201 })
}
