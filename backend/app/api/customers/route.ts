import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'

export async function GET(request: Request) {
  const tenant = tenantId(request); if (!tenant) return error('Falta x-tenant-id.', 401)
  const q = new URL(request.url).searchParams.get('q') || ''
  const data = await prisma.customer.findMany({ where: { tenantId: tenant, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }, { document: { contains: q } }] } : {}) }, orderBy: { createdAt: 'desc' }, take: 50 })
  return json(data)
}

export async function POST(request: Request) {
  const tenant = tenantId(request); if (!tenant) return error('Falta x-tenant-id.', 401)
  const body = await request.json(); if (!body.name) return error('El nombre es obligatorio.')
  const existing = body.document ? await prisma.customer.findFirst({ where: { tenantId: tenant, document: body.document } }) : null
  const data = existing ? await prisma.customer.update({ where: { id: existing.id }, data: { ...body, tenantId: undefined } }) : await prisma.customer.create({ data: { tenantId: tenant, name: body.name, phone: body.phone, email: body.email, document: body.document, notes: body.notes } })
  return json(data, { status: existing ? 200 : 201 })
}
