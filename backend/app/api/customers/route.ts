import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''

function addressesInput(value: unknown) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > 10) throw new Error('Podés guardar hasta 10 direcciones.')
  const addresses = value.map((row, index) => {
    const item = row && typeof row === 'object' ? row as Record<string, unknown> : {}
    const address = clean(item.address, 400)
    if (!address) throw new Error('Cada dirección debe incluir su detalle.')
    return {
      label: clean(item.label, 80) || `Dirección ${index + 1}`,
      address,
      city: clean(item.city, 100) || null,
      department: clean(item.department, 100) || null,
      notes: clean(item.notes, 400) || null,
      isDefault: item.isDefault === true,
    }
  })
  return addresses.map((address, index) => ({ ...address, isDefault: address.isDefault || (index === 0 && !addresses.some(item => item.isDefault)) }))
}

export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const q = new URL(request.url).searchParams.get('q') || ''
  const data = await prisma.customer.findMany({ where: { tenantId: tenant, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }, { document: { contains: q } }] } : {}) }, include: { addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] } }, orderBy: { createdAt: 'desc' }, take: 50 })
  return json(data)
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  try {
    const body = await request.json() as Record<string, unknown>
    const name = clean(body.name, 200)
    if (!name) return error('El nombre es obligatorio.')
    const document = clean(body.document, 100) || null
    const phone = clean(body.phone, 100) || null
    const countryCode = typeof body.countryCode === 'string' && /^\+\d{1,4}$/.test(body.countryCode) ? body.countryCode : '+595'
    const fields = { name, phone, countryCode, email: clean(body.email, 200) || null, document, notes: clean(body.notes, 2000) || null }
    const addresses = addressesInput(body.addresses)
    const existing = document
      ? await prisma.customer.findFirst({ where: { tenantId: tenant, document } })
      : phone ? await prisma.customer.findFirst({ where: { tenantId: tenant, phone } }) : null
    const data = existing
      ? await prisma.customer.update({ where: { id: existing.id }, data: { ...fields, ...(addresses === undefined ? {} : { addresses: { deleteMany: {}, create: addresses } }) }, include: { addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] } } })
      : await prisma.customer.create({ data: { tenantId: tenant, ...fields, ...(addresses ? { addresses: { create: addresses } } : {}) }, include: { addresses: true } })
    return json(data, { status: existing ? 200 : 201 })
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo guardar el cliente.') }
}
