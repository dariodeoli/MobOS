import { prisma } from '../../../lib/prisma'
import { requireSession } from '../../../lib/auth'
import { error, json, tenantId } from '../../../lib/http'
import { InputError, objectInput, textInput } from '../../../lib/payment-input'
import { expectedUnits } from '../../../lib/stock-verification-db'

const ROLES_DE_SUCURSAL = ['VENDEDOR', 'CAJERA']

// Verificación de stock («¿está físicamente?»): la puede usar cualquier usuario
// autenticado. Quien tiene sucursal asignada solo verifica la suya; el resto elige.
export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const params = new URL(request.url).searchParams
  const asignada = ROLES_DE_SUCURSAL.includes(session.user.role) ? session.user.branchId : null
  const branchId = asignada || params.get('branchId') || null
  const sessions = await prisma.stockVerification.findMany({
    where: { tenantId: tenant, ...(branchId ? { branchId } : {}) },
    orderBy: { startedAt: 'desc' },
    take: 50,
  })
  const [branches, users, locations] = await Promise.all([
    prisma.branch.findMany({ where: { tenantId: tenant, id: { in: [...new Set(sessions.map(item => item.branchId))] } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { tenantId: tenant, id: { in: [...new Set(sessions.flatMap(item => [item.startedById, item.finishedById].filter(Boolean) as string[]))] } }, select: { id: true, name: true } }),
    prisma.stockLocation.findMany({ where: { tenantId: tenant, id: { in: sessions.map(item => item.locationId).filter(Boolean) as string[] } }, select: { id: true, name: true } }),
  ])
  const b = new Map(branches.map(item => [item.id, item])); const u = new Map(users.map(item => [item.id, item])); const l = new Map(locations.map(item => [item.id, item]))
  return json(sessions.map(item => ({
    id: item.id, status: item.status, note: item.note, startedAt: item.startedAt, finishedAt: item.finishedAt,
    branch: b.get(item.branchId) ?? null, location: item.locationId ? l.get(item.locationId) ?? null : null,
    startedBy: u.get(item.startedById) ?? { id: item.startedById, name: 'Usuario' }, finishedBy: item.finishedById ? u.get(item.finishedById) ?? null : null,
    summary: { expected: item.expectedCount, verified: item.verifiedCount, missing: item.missingCount, unexpected: item.unexpectedCount },
  })))
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  try {
    const body = objectInput(await request.json())
    const candidate = typeof body.branchId === 'string' && body.branchId ? body.branchId : null
    const branchId = session.user.branchId || candidate
    if (!branchId) throw new InputError('Elegí la sucursal a verificar.', 409)
    const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId: tenant, isActive: true }, select: { id: true } })
    if (!branch) throw new InputError('Sucursal no encontrada.', 404)
    const locationId = body.locationId === undefined || body.locationId === null || body.locationId === '' ? null : textInput(body.locationId, 'Depósito', 200)
    if (locationId && !(await prisma.stockLocation.findFirst({ where: { id: locationId, tenantId: tenant, branchId, isActive: true }, select: { id: true } }))) throw new InputError('Depósito no encontrado en esa sucursal.', 404)
    const note = body.note === undefined || body.note === null || body.note === '' ? null : textInput(body.note, 'Nota', 300)
    const abierta = await prisma.stockVerification.findFirst({ where: { tenantId: tenant, branchId, locationId, status: 'OPEN' }, select: { id: true } })
    if (abierta) return json({ id: abierta.id, reused: true }, { status: 200 })
    const expected = await expectedUnits(prisma, { tenantId: tenant, branchId, locationId })
    const created = await prisma.stockVerification.create({ data: { tenantId: tenant, branchId, locationId, note, startedById: session.user.id, expectedCount: expected.length, missingCount: expected.length } })
    await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'STOCK_VERIFICATION_STARTED', entity: 'StockVerification', entityId: created.id, metadata: { branchId, locationId, expected: expected.length } } })
    return json({ id: created.id, reused: false }, { status: 201 })
  } catch (cause) {
    if (cause instanceof InputError) return error(cause.message, cause.status)
    return error(cause instanceof Error ? cause.message : 'No se pudo iniciar la verificación.', 400)
  }
}
