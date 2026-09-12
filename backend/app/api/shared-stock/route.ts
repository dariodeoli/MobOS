import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

const text = (value: unknown, max = 128) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const grants = await prisma.inventoryVisibilityGrant.findMany({
    where: { recipientTenantId: session.user.tenantId, isActive: true },
    include: { providerTenant: { select: { id: true, name: true } } },
    orderBy: { providerTenant: { name: 'asc' } },
  })
  if (!grants.length) return json([])
  const products = await prisma.product.findMany({
    where: { tenantId: { in: grants.map(grant => grant.providerTenantId) }, isActive: true, stock: { gt: 0 } },
    select: { tenantId: true, id: true, sku: true, name: true, category: true, condition: true, stock: true, branch: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' }, take: 500,
  })
  const source = new Map(grants.map(grant => [grant.providerTenantId, grant.providerTenant.name]))
  // Contrato deliberadamente mínimo: no devuelve precio/costo, IMEI, reservas, clientes ni movimientos.
  return json(products.map(product => ({ sourceTenant: source.get(product.tenantId), sourceTenantId: product.tenantId, branch: product.branch, product: { id: product.id, sku: product.sku, name: product.name, category: product.category, condition: product.condition }, available: product.stock })))
}

export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('Solo un administrador puede compartir disponibilidad.', 403)
  try {
    const body = await request.json(); const recipientTenantId = text(body.recipientTenantId)
    if (!recipientTenantId || recipientTenantId === session.user.tenantId || typeof body.isActive !== 'boolean') return error('Destinatario distinto y estado booleano son obligatorios.')
    const grant = await prisma.$transaction(async tx => {
      const recipient = await tx.tenant.findUnique({ where: { id: recipientTenantId }, select: { id: true } })
      if (!recipient) throw new Error('Empresa destinataria no encontrada.')
      const result = await tx.inventoryVisibilityGrant.upsert({ where: { providerTenantId_recipientTenantId: { providerTenantId: session.user.tenantId, recipientTenantId } }, create: { providerTenantId: session.user.tenantId, recipientTenantId, createdById: session.user.id, isActive: body.isActive }, update: { isActive: body.isActive, createdById: session.user.id } })
      await tx.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: body.isActive ? 'STOCK_VISIBILITY_GRANTED' : 'STOCK_VISIBILITY_REVOKED', entity: 'InventoryVisibilityGrant', entityId: result.id, metadata: { recipientTenantId } } })
      return result
    })
    return json(grant, { status: 201 })
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo actualizar el permiso.', 409) }
}
