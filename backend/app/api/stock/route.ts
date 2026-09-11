import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'

export async function GET(request: Request) { const tenant = tenantId(request); if (!tenant) return error('Falta x-tenant-id.', 401); return json(await prisma.product.findMany({ where: { tenantId: tenant, isActive: true }, orderBy: { name: 'asc' } })) }
export async function PATCH(request: Request) { const tenant = tenantId(request); if (!tenant) return error('Falta x-tenant-id.', 401); const b = await request.json(); if (!b.id || !Number.isInteger(Number(b.stock))) return error('id y stock entero son obligatorios.'); const data = await prisma.product.updateMany({ where: { id: b.id, tenantId: tenant }, data: { stock: Number(b.stock) } }); if (!data.count) return error('Producto no encontrado.', 404); return json(await prisma.product.findUnique({ where: { id: b.id } })) }
