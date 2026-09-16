import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'

// Página pública de garantía: el token opaco del QR muestra modelo, días
// restantes, cobertura y exclusiones. Nunca expone costos, teléfonos,
// direcciones ni datos internos del negocio.
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  if (!token || token.length > 200) return error('Garantía no encontrada.', 404)
  const warranty = await prisma.warrantyCase.findUnique({ where: { publicToken: token }, select: {
    id: true, customerName: true, serial: true, description: true, status: true, createdAt: true, expiresAt: true,
    warrantyDays: true, coverage: true, exclusions: true,
    branch: { select: { name: true, phone: true, city: true } },
    orderItem: { select: { description: true, product: { select: { name: true } }, order: { select: { createdAt: true, orderNumber: true } } } },
  } })
  if (!warranty) return error('Garantía no encontrada.', 404)
  const now = Date.now()
  const expiresAt = warranty.expiresAt ? new Date(warranty.expiresAt).getTime() : null
  const daysRemaining = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 86400000)) : null
  return json({
    customerName: warranty.customerName,
    serial: warranty.serial,
    productName: warranty.orderItem?.product?.name || warranty.orderItem?.description || warranty.description,
    status: warranty.status,
    createdAt: warranty.createdAt,
    expiresAt: warranty.expiresAt,
    warrantyDays: warranty.warrantyDays,
    daysRemaining,
    coverage: warranty.coverage,
    exclusions: warranty.exclusions,
    store: { name: warranty.branch?.name || null, phone: warranty.branch?.phone || null, city: warranty.branch?.city || null },
    orderNumber: warranty.orderItem?.order?.orderNumber || null,
    purchasedAt: warranty.orderItem?.order?.createdAt || warranty.createdAt,
  })
}
