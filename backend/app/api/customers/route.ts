import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'

export async function GET(request: Request) {
  const tenant = await tenantId(request); if (!tenant) return error('Falta sesión.', 401)
  const q = new URL(request.url).searchParams.get('q') || ''
  const data = await prisma.customer.findMany({ where: { tenantId: tenant, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }, { document: { contains: q } }] } : {}) }, include: { addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] } }, orderBy: { createdAt: 'desc' }, take: 50 })
  return json(data)
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); if (!tenant) return error('Falta sesión.', 401)
  const body = await request.json(); if (typeof body.name !== 'string' || !body.name.trim()) return error('El nombre es obligatorio.')
  const existing = body.document ? await prisma.customer.findFirst({ where: { tenantId: tenant, document: body.document } }) : null
  const countryCode = typeof body.countryCode === 'string' && /^\+\d{1,4}$/.test(body.countryCode) ? body.countryCode : '+595'
  const fields = { name: body.name.trim(), phone: typeof body.phone === 'string' ? body.phone.trim() || null : null, countryCode, email: body.email, document: body.document, notes: body.notes }
  const addresses: Array<{ label: string; address: string; city: string | null; notes: string | null; isDefault: boolean }> = Array.isArray(body.addresses) ? body.addresses.slice(0, 10).map((row: any, index: number) => ({ label: typeof row?.label === 'string' && row.label.trim() ? row.label.trim().slice(0, 80) : `Dirección ${index + 1}`, address: typeof row?.address === 'string' ? row.address.trim().slice(0, 400) : '', city: typeof row?.city === 'string' ? row.city.trim().slice(0, 100) || null : null, notes: typeof row?.notes === 'string' ? row.notes.trim().slice(0, 400) || null : null, isDefault: row?.isDefault === true })) : []
  if (addresses.some(row => !row.address)) return error('Cada dirección debe incluir su detalle.')
  const data = existing ? await prisma.customer.update({ where: { id: existing.id }, data: { ...fields, ...(body.addresses === undefined ? {} : { addresses: { deleteMany: {}, create: addresses.map((row, index) => ({ ...row, isDefault: row.isDefault || index === 0 && !addresses.some(x => x.isDefault) })) } }) }, include: { addresses: true } }) : await prisma.customer.create({ data: { tenantId: tenant, ...fields, addresses: { create: addresses.map((row, index) => ({ ...row, isDefault: row.isDefault || index === 0 && !addresses.some(x => x.isDefault) })) } }, include: { addresses: true } })
  return json(data, { status: existing ? 200 : 201 })
}
