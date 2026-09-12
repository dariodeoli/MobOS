import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

const text = (value: unknown, max: number, required = false) => {
  if (value === undefined || value === null || value === '') return required ? null : null
  if (typeof value !== 'string') return undefined
  const result = value.trim()
  return result && result.length <= max ? result : undefined
}

async function context(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return null
  if (!['ADMIN', 'GERENTE'].includes(session.user.role)) return false
  return { tenant, session }
}

export async function GET(request: Request) {
  const auth = await context(request)
  if (auth === null) return error('Falta sesión.', 401)
  if (auth === false) return error('No autorizado.', 403)
  const suppliers = await prisma.supplier.findMany({ where: { tenantId: auth.tenant, isActive: true }, orderBy: { name: 'asc' }, take: 250 })
  return json(suppliers)
}

export async function POST(request: Request) {
  const auth = await context(request)
  if (auth === null) return error('Falta sesión.', 401)
  if (auth === false) return error('No autorizado.', 403)
  const body = await request.json(); const name = text(body.name, 160, true)
  if (!name) return error('El nombre del proveedor es obligatorio.')
  const fields = { document: text(body.document, 48), phone: text(body.phone, 40), email: text(body.email, 160), notes: text(body.notes, 1000) }
  if (Object.values(fields).some(value => value === undefined)) return error('Datos de proveedor inválidos.')
  try {
    const supplier = await prisma.supplier.create({ data: { tenantId: auth.tenant, name, ...fields } })
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
  for (const [key, max] of Object.entries({ name: 160, document: 48, phone: 40, email: 160, notes: 1000 })) {
    if (body[key] !== undefined) { const value = text(body[key], max, key === 'name'); if (value === undefined || (key === 'name' && !value)) return error('Datos de proveedor inválidos.'); data[key] = value }
  }
  if (body.isActive !== undefined) { if (typeof body.isActive !== 'boolean') return error('Estado inválido.'); data.isActive = body.isActive }
  try {
    const updated = await prisma.supplier.update({ where: { id: supplier.id }, data })
    await prisma.auditLog.create({ data: { tenantId: auth.tenant, userId: auth.session.user.id, action: updated.isActive ? 'SUPPLIER_UPDATED' : 'SUPPLIER_ARCHIVED', entity: 'Supplier', entityId: supplier.id, metadata: { changed: Object.keys(data) } } })
    return json(updated)
  } catch { return error('No se pudo actualizar el proveedor.', 409) }
}
