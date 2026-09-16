import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

const text = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null

const BRANCH_FIELDS = { name: 100, address: 200, city: 100, department: 100, phone: 40, instagram: 120 } as const

// Gestión de sucursales. Lectura para cualquier rol de la propia empresa;
// escritura exclusiva de ADMIN. Todo cambio queda auditado.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const branches = await prisma.branch.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  })
  return json(branches)
}

export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('Solo un administrador puede crear sucursales.', 403)
  let body: any; try { body = await request.json() } catch { return error('JSON inválido.') }
  const name = text(body.name, 100)
  if (!name) return error('El nombre de la sucursal es obligatorio.')
  const fields: Record<string, string | null> = {}
  for (const [key, max] of Object.entries(BRANCH_FIELDS)) {
    if (key === 'name') continue
    fields[key] = text(body[key], max)
  }
  try {
    const branch = await prisma.$transaction(async tx => {
      const created = await tx.branch.create({ data: { tenantId: session.user.tenantId, name, ...fields } })
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'BRANCH_CREATED', entity: 'Branch', entityId: created.id, metadata: { name, ...fields } } })
      return created
    })
    return json(branch, { status: 201 })
  } catch { return error('No se pudo crear la sucursal.', 409) }
}

export async function PATCH(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('Solo un administrador puede editar sucursales.', 403)
  let body: any; try { body = await request.json() } catch { return error('JSON inválido.') }
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return error('Sucursal obligatoria.')
  const before = await prisma.branch.findFirst({ where: { id, tenantId: session.user.tenantId } })
  if (!before) return error('Sucursal no encontrada.', 404)
  const changes: Record<string, string | null | boolean> = {}
  for (const [key, max] of Object.entries(BRANCH_FIELDS)) {
    if (body[key] === undefined) continue
    const value = body[key] === null || body[key] === '' ? null : text(body[key], max)
    if (value === null && body[key] !== null && body[key] !== '') return error('Datos de sucursal inválidos.')
    changes[key] = value
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') return error('Estado inválido.')
    changes.isActive = body.isActive
  }
  try {
    const updated = await prisma.$transaction(async tx => {
      const branch = await tx.branch.update({ where: { id }, data: changes })
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'BRANCH_UPDATED', entity: 'Branch', entityId: id, metadata: { before: { name: before.name, city: before.city, isActive: before.isActive }, after: { name: branch.name, city: branch.city, isActive: branch.isActive } } } })
      return branch
    })
    return json(updated)
  } catch { return error('No se pudo actualizar la sucursal.', 409) }
}
