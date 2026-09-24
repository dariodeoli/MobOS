import { prisma } from '../../../../lib/prisma'
import { error, json, tenantId } from '../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../lib/auth'

// #250 Fase 6: política de reposición (stock de seguridad + plazo de entrega)
// por producto y sucursal. Alimenta la reposición sugerida y las alertas.
export async function GET(request: Request) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  if (!canAccessAny(session.user, ['stock:manage'])) return error('No autorizado.', 403)

  const params = new URL(request.url).searchParams
  const policies = await prisma.supplyPolicy.findMany({
    where: {
      tenantId: tenant,
      ...(params.get('productId') ? { productId: String(params.get('productId')) } : {}),
      ...(params.get('branchId') ? { branchId: String(params.get('branchId')) } : {}),
    },
    orderBy: [{ updatedAt: 'desc' }],
    take: Math.min(500, Math.max(1, Number(params.get('limit')) || 200)),
    include: { product: { select: { name: true, reorderPoint: true } }, branch: { select: { name: true } }, updatedBy: { select: { name: true } } },
  })
  return json({ fecha: new Date().toISOString(), policies })
}

export async function PUT(request: Request) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  if (!canAccessAny(session.user, ['stock:manage'])) return error('No autorizado.', 403)

  let body: any
  try { body = await request.json() } catch { return error('JSON inválido.') }
  const productId = typeof body?.productId === 'string' ? body.productId.trim() : ''
  const branchId = typeof body?.branchId === 'string' ? body.branchId.trim() : ''
  if (!productId || !branchId) return error('Indicá el producto y la sucursal.')
  const safetyStock = Number(body?.safetyStock ?? 0)
  const leadTimeDays = Number(body?.leadTimeDays ?? 7)
  if (!Number.isInteger(safetyStock) || safetyStock < 0 || safetyStock > 9999) return error('El stock de seguridad debe ser un entero entre 0 y 9999.')
  if (!Number.isInteger(leadTimeDays) || leadTimeDays < 0 || leadTimeDays > 365) return error('El plazo de entrega debe ser un entero entre 0 y 365 días.')

  const [producto, sucursal] = await Promise.all([
    prisma.product.findFirst({ where: { id: productId, tenantId: tenant }, select: { id: true } }),
    prisma.branch.findFirst({ where: { id: branchId, tenantId: tenant }, select: { id: true } }),
  ])
  if (!producto) return error('Producto no encontrado.', 404)
  if (!sucursal) return error('Sucursal no encontrada.', 404)

  const guardada = await prisma.$transaction(async (tx) => {
    const fila = await tx.supplyPolicy.upsert({
      where: { tenantId_productId_branchId: { tenantId: tenant, productId, branchId } },
      create: { tenantId: tenant, productId, branchId, safetyStock, leadTimeDays, updatedById: session.user.id },
      update: { safetyStock, leadTimeDays, updatedById: session.user.id },
    })
    await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'SUPPLY_POLICY_UPDATED', entity: 'SupplyPolicy', entityId: fila.id, metadata: { productId, branchId, safetyStock, leadTimeDays } } })
    return fila
  })
  return json(guardada)
}
