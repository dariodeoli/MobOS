import { prisma } from '../../../../lib/prisma'
import { canAccessAny, requireSession } from '../../../../lib/auth'
import { error, json, tenantId } from '../../../../lib/http'

// Detalle del conteo: lo escaneado, lo esperado en la sucursal y lo que falta.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['stock:manage', 'stock:read', 'products:read'])) return error('No autorizado.', 403)
  const { id } = await context.params
  const count = await prisma.inventoryCount.findFirst({ where: { id, tenantId: tenant }, include: { branch: { select: { id: true, name: true } }, location: { select: { id: true, name: true } } } })
  if (!count) return error('Conteo no encontrado.', 404)
  const lines = await prisma.inventoryCountLine.findMany({ where: { countId: count.id }, orderBy: { createdAt: 'desc' }, take: 5000, include: { product: { select: { id: true, name: true, sku: true } } } })
  const serialSnapshot = Array.isArray(count.serialSnapshot) ? count.serialSnapshot as Array<{ id: string; serial: string; productId: string }> : null
  const expectedUnits = serialSnapshot?.length ? await prisma.inventoryUnit.findMany({ where: { id: { in: serialSnapshot.map(unit => unit.id) }, tenantId: tenant, branchId: count.branchId, status: 'AVAILABLE', ...(count.locationId ? { locationId: count.locationId } : {}) }, orderBy: { serial: 'asc' }, take: 5000, select: { id: true, serial: true, productId: true, product: { select: { name: true, sku: true } } } }) : []
  const scanned = new Set(lines.filter(line => line.serial).map(line => line.serial as string))
  const missing = count.scope === 'FULL' ? expectedUnits.filter(unit => !scanned.has(unit.serial)) : []
  const unexpected = lines.filter(line => line.serial && !line.expected)
  const quantityLines = lines.filter(line => !line.serial && line.productId)
  const countedByProduct = new Map(quantityLines.map(line => [line.productId as string, line.quantity]))
  const quantityProducts = count.locationId ? [] : await prisma.product.findMany({
    where: { tenantId: tenant, branchId: count.branchId, isActive: true, NOT: { stockKind: 'EQUIPO' }, ...(count.scope === 'PARTIAL' ? { id: { in: quantityLines.map(line => line.productId as string) } } : {}) },
    select: { id: true, name: true, sku: true, stock: true },
  })
  const quantityDifferences = quantityProducts.map(product => {
    const counted = count.scope === 'FULL' ? (countedByProduct.get(product.id) ?? 0) : (countedByProduct.get(product.id) ?? 0)
    const snapshot = count.stockSnapshot && typeof count.stockSnapshot === 'object' && !Array.isArray(count.stockSnapshot) ? count.stockSnapshot as Record<string, number> : null
    const expected = snapshot?.[product.id] ?? product.stock
    return { productId: product.id, productName: product.name, sku: product.sku, expected, counted, delta: counted - expected, current: product.stock, changedDuringCount: product.stock !== expected }
  })
  const stockSnapshot = count.stockSnapshot && typeof count.stockSnapshot === 'object' && !Array.isArray(count.stockSnapshot) ? count.stockSnapshot as Record<string, number> : null
  const snapshotMissingProducts = count.scope === 'FULL' ? quantityProducts.filter(product => stockSnapshot && !(product.id in stockSnapshot)).map(product => ({ id: product.id, name: product.name, sku: product.sku })) : []
  return json({
    ...count,
    lines,
    expectedUnits,
    missing,
    quantityDifferences,
    snapshotMissingProducts,
    needsRecount: count.scope === 'FULL' && !serialSnapshot,
    summary: { expected: expectedUnits.length, counted: scanned.size, missing: missing.length, unexpected: unexpected.length, productsWithoutSerial: quantityLines.length, quantityDifferences: quantityDifferences.length, scope: count.scope, locationId: count.locationId },
  })
}
