import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'

export async function GET(request: Request) {
  const tenant = await tenantId(request); if (!tenant) return error('Falta sesión.', 401)
  const q = new URL(request.url).searchParams.get('q') || ''
  const data = await prisma.customer.findMany({ where: { tenantId: tenant, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }, { document: { contains: q } }] } : {}) }, orderBy: { createdAt: 'desc' }, take: 50 })
  return json(data)
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); if (!tenant) return error('Falta sesión.', 401)
  const body = await request.json(); if (typeof body.name !== 'string' || !body.name.trim()) return error('El nombre es obligatorio.')
  const existing = body.document ? await prisma.customer.findFirst({ where: { tenantId: tenant, document: body.document } }) : null
  const fields = { name: body.name.trim(), phone: body.phone, email: body.email, document: body.document, notes: body.notes }
  const data = existing ? await prisma.customer.update({ where: { id: existing.id }, data: fields }) : await prisma.customer.create({ data: { tenantId: tenant, ...fields } })
  return json(data, { status: existing ? 200 : 201 })
}
