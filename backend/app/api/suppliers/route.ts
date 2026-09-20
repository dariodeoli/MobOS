import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { canAccessAny, requireSession } from '../../../lib/auth'

const text = (value: unknown, max: number, required = false) => {
  if (value === undefined || value === null || value === '') return required ? null : null
  if (typeof value !== 'string') return undefined
  const result = value.trim()
  return result && result.length <= max ? result : undefined
}

// Formato laxo: no bloquea teléfonos locales/WhatsApp ni correos poco usuales.
const laxPhone = (value: string) => /^[0-9+()\-.\s]{5,40}$/.test(value)
const laxEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)

const SUPPLIER_FIELDS = { name: 160, code: 32, document: 48, phone: 40, address: 200, city: 120, department: 120, email: 160, contactName: 160, paymentTerms: 120, notes: 1000 }

async function context(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return null
  if (!canAccessAny(session.user, ['purchases:manage'])) return false
  return { tenant, session }
}

export async function GET(request: Request) {
  const auth = await context(request)
  if (auth === null) return error('Falta sesión.', 401)
  if (auth === false) return error('No autorizado.', 403)
  // Búsqueda del header global: nombre o abreviatura del proveedor.
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 120)
  const suppliers = await prisma.supplier.findMany({
    where: {
      tenantId: auth.tenant,
      isActive: true,
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    orderBy: { name: 'asc' },
    take: 250,
  })
  return json(suppliers)
}

export async function POST(request: Request) {
  const auth = await context(request)
  if (auth === null) return error('Falta sesión.', 401)
  if (auth === false) return error('No autorizado.', 403)
  const body = await request.json(); const name = text(body.name, 160, true)
  if (!name) return error('El nombre del proveedor es obligatorio.')
  const fields: Record<string, string | null | undefined> = {}
  for (const [key, max] of Object.entries(SUPPLIER_FIELDS)) {
    if (key === 'name') continue
    fields[key] = text(body[key], max)
  }
  if (Object.values(fields).some(value => value === undefined)) return error('Datos de proveedor inválidos.')
  if (fields.phone && !laxPhone(fields.phone)) return error('Teléfono inválido.')
  if (fields.email && !laxEmail(fields.email)) return error('Email inválido.')
  if (fields.code && await prisma.supplier.findFirst({ where: { tenantId: auth.tenant, code: fields.code }, select: { id: true } })) return error('Ya existe un proveedor con esa abreviatura.', 409)
  const data: Record<string, string | null> = {}
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) data[key] = value
  try {
    const supplier = await prisma.supplier.create({ data: { tenantId: auth.tenant, name, ...data } })
    await prisma.auditLog.create({ data: { tenantId: auth.tenant, userId: auth.session.user.id, action: 'SUPPLIER_CREATED', entity: 'Supplier', entityId: supplier.id, metadata: { name } } })
    return json(supplier, { status: 201 })
  } catch { return error('Ya existe un proveedor con ese nombre.', 409) }
}

export async function PATCH(request: Request) {
  const auth = await context(request)
  if (auth === null) return error('Falta sesión.', 401)
  if (auth === false) return error('No autorizado.', 403)
  const body = await request.json(); if (typeof body.id !== 'string' || !body.id) return error('Proveedor inválido.')
  const supplier = await prisma.supplier.findFirst({ where: { id: body.id, tenantId: auth.tenant } })
  if (!supplier) return error('Proveedor no encontrado.', 404)
  const data: Record<string, string | boolean | null> = {}
  for (const [key, max] of Object.entries(SUPPLIER_FIELDS)) {
    if (body[key] !== undefined) { const value = text(body[key], max, key === 'name'); if (value === undefined || (key === 'name' && !value)) return error('Datos de proveedor inválidos.'); if (value && key === 'phone' && !laxPhone(value)) return error('Teléfono inválido.'); if (value && key === 'email' && !laxEmail(value)) return error('Email inválido.'); data[key] = value }
  }
  if (body.isActive !== undefined) { if (typeof body.isActive !== 'boolean') return error('Estado inválido.'); data.isActive = body.isActive }
  try {
    const updated = await prisma.supplier.update({ where: { id: supplier.id }, data })
    await prisma.auditLog.create({ data: { tenantId: auth.tenant, userId: auth.session.user.id, action: updated.isActive ? 'SUPPLIER_UPDATED' : 'SUPPLIER_ARCHIVED', entity: 'Supplier', entityId: supplier.id, metadata: { changed: Object.keys(data) } } })
    return json(updated)
  } catch { return error('No se pudo actualizar el proveedor.', 409) }
}
