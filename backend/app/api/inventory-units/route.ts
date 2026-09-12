import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

const serialKey = (value: string) => value.trim().toUpperCase().replace(/[\s-]+/g, '')
const canSeeBranch = (role: string, assigned: string | null, branchId: string | null) => !['VENDEDOR', 'CAJERA'].includes(role) || assigned === branchId

// Consulta diseñada para lectores: el escáner se comporta como teclado y puede
// enviar el IMEI completo, el SKU de un accesorio o el código MOBOS:<imei>.
export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const params = new URL(request.url).searchParams
  const branchId = params.get('branchId')
  if (branchId && !canSeeBranch(session.user.role, session.user.branchId, branchId)) return error('No autorizado para esa sucursal.', 403)
  const raw = (params.get('q') || '').replace(/^MOBOS:/i, '')
  const query = raw ? serialKey(raw) : ''
  const units = await prisma.inventoryUnit.findMany({
    where: { tenantId: tenant, ...(branchId ? { branchId } : session.user.branchId ? { branchId: session.user.branchId } : {}), ...(query ? { OR: [{ serial: { contains: query, mode: 'insensitive' } }, { product: { sku: { contains: query, mode: 'insensitive' } } }, { product: { name: { contains: raw, mode: 'insensitive' } } }] } : {}) },
    include: { product: { select: { id: true, name: true, sku: true, pricePyg: true } }, branch: { select: { id: true, name: true } }, location: { select: { id: true, name: true, code: true } } },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }], take: 100,
  })
  return json(units)
}
