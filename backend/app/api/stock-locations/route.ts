import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

const text = (value: unknown, max = 120) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null
const privileged = (role: string) => role === 'ADMIN' || role === 'GERENTE'

function canManageBranch(role: string, assignedBranchId: string | null, branchId: string) {
  return role === 'ADMIN' || (role === 'GERENTE' && assignedBranchId === branchId)
}

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const requestedBranch = new URL(request.url).searchParams.get('branchId')
  if (['VENDEDOR', 'CAJERA'].includes(session.user.role) && requestedBranch && requestedBranch !== session.user.branchId) return error('No autorizado para esa sucursal.', 403)
  return json(await prisma.stockLocation.findMany({
    where: { tenantId: session.user.tenantId, ...(requestedBranch ? { branchId: requestedBranch } : ['VENDEDOR', 'CAJERA'].includes(session.user.role) ? { branchId: session.user.branchId ?? '__none__' } : {}) },
    include: { branch: { select: { id: true, name: true } }, _count: { select: { inventoryUnits: true } } },
    orderBy: [{ branch: { name: 'asc' } }, { name: 'asc' }],
  }))
}

export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!privileged(session.user.role)) return error('No autorizado.', 403)
  try {
    const body = await request.json()
    const branchId = text(body.branchId, 128), name = text(body.name), code = body.code === undefined || body.code === null || body.code === '' ? null : text(body.code, 32)?.toUpperCase()
    const color = body.color === undefined || body.color === null || body.color === '' ? null : String(body.color).trim().toLowerCase()
    if (color && !/^#[0-9a-f]{6}$/.test(color)) return error('El color debe ser un hex #rrggbb.')
    if (!branchId || !name || (body.code && !code)) return error('Sucursal, nombre y código válido son obligatorios cuando se informa un código.')
    if (!canManageBranch(session.user.role, session.user.branchId, branchId)) return error('No autorizado para esa sucursal.', 403)
    const location = await prisma.$transaction(async tx => {
      const branch = await tx.branch.findFirst({ where: { id: branchId, tenantId: session.user.tenantId, isActive: true }, select: { id: true } })
      if (!branch) throw new Error('Sucursal no encontrada.')
      const created = await tx.stockLocation.create({ data: { tenantId: session.user.tenantId, branchId, name, code, color } })
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'STOCK_LOCATION_CREATED', entity: 'StockLocation', entityId: created.id, metadata: { branchId, name, code } } })
      return created
    })
    return json(location, { status: 201 })
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo crear la ubicación.', 409) }
}

export async function PATCH(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!privileged(session.user.role)) return error('No autorizado.', 403)
  try {
    const body = await request.json(); const id = text(body.id, 128)
    if (!id) return error('Ubicación obligatoria.')
    const before = await prisma.stockLocation.findFirst({ where: { id, tenantId: session.user.tenantId } })
    if (!before) return error('Ubicación no encontrada.', 404)
    if (!canManageBranch(session.user.role, session.user.branchId, before.branchId)) return error('No autorizado para esa sucursal.', 403)
    const name = body.name === undefined ? undefined : text(body.name)
    const code = body.code === undefined ? undefined : body.code === null || body.code === '' ? null : text(body.code, 32)?.toUpperCase()
    const color = body.color === undefined ? undefined : body.color === null || body.color === '' ? null : String(body.color).trim().toLowerCase()
    if ((body.name !== undefined && !name) || (body.code !== undefined && body.code && !code) || (color && !/^#[0-9a-f]{6}$/.test(color)) || (body.isActive !== undefined && typeof body.isActive !== 'boolean')) return error('Datos de ubicación inválidos.')
    const changes: { name?: string; code?: string | null; color?: string | null; isActive?: boolean } = {}
    if (name) changes.name = name
    if (code !== undefined) changes.code = code
    if (color !== undefined) changes.color = color
    if (typeof body.isActive === 'boolean') changes.isActive = body.isActive
    const updated = await prisma.$transaction(async tx => {
      const location = await tx.stockLocation.update({ where: { id }, data: changes })
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'STOCK_LOCATION_UPDATED', entity: 'StockLocation', entityId: id, metadata: { before: { name: before.name, code: before.code, isActive: before.isActive }, after: { name: location.name, code: location.code, isActive: location.isActive } } } })
      return location
    })
    return json(updated)
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo actualizar la ubicación.', 409) }
}
