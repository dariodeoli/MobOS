import { prisma } from '../../../../lib/prisma'
import { canAccessAny, requireSession } from '../../../../lib/auth'
import { error, json, tenantId } from '../../../../lib/http'

// Detalle del conteo: lo escaneado, lo esperado en la sucursal y lo que falta.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['stock:manage', 'stock:read', 'products:read'])) return error('No autorizado.', 403)
  const { id } = await context.params
  const count = await prisma.inventoryCount.findFirst({ where: { id, tenantId: tenant }, include: { branch: { select: { id: true, name: true } } } })
  if (!count) return error('Conteo no encontrado.', 404)
  const lines = await prisma.inventoryCountLine.findMany({ where: { countId: count.id }, orderBy: { createdAt: 'desc' }, take: 5000, include: { product: { select: { id: true, name: true, sku: true } } } })
  const expectedUnits = await prisma.inventoryUnit.findMany({ where: { tenantId: tenant, branchId: count.branchId, status: 'AVAILABLE' }, orderBy: { serial: 'asc' }, take: 5000, select: { id: true, serial: true, productId: true, product: { select: { name: true, sku: true } } } })
  const scanned = new Set(lines.filter(line => line.serial).map(line => line.serial as string))
  const missing = expectedUnits.filter(unit => !scanned.has(unit.serial))
  const unexpected = lines.filter(line => line.serial && !line.expected)
  return json({
    ...count,
    lines,
    expectedUnits,
    missing,
    summary: { expected: expectedUnits.length, counted: scanned.size, missing: missing.length, unexpected: unexpected.length, productsWithoutSerial: lines.filter(line => !line.serial).length },
  })
}
