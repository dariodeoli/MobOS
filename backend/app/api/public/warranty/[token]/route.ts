import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import { buscarPorTokenPublico } from '../../../../../lib/public-token'

// Página pública de garantía: el token opaco del QR muestra modelo, días
// restantes, cobertura y exclusiones. Nunca expone costos, teléfonos,
// direcciones ni datos internos del negocio.
// Seguridad (#172/#178): rate limit como el resto de las páginas públicas y
// resolución por hash (los enlaces legacy en claro siguen funcionando mientras
// dura la rotación; al primer uso se les guarda el hash).
const SELECT = {
  id: true, customerName: true, serial: true, description: true, status: true, createdAt: true, expiresAt: true,
  warrantyDays: true, coverage: true, exclusions: true,
  branch: { select: { name: true, phone: true, city: true } },
  orderItem: { select: { description: true, product: { select: { name: true } }, order: { select: { createdAt: true, orderNumber: true } } } },
} as const

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const limited = enforceRateLimit(request, 'public-warranty', 30, 60_000)
  if (limited) return limited

  const { token } = await context.params
  if (!token || token.length > 200) return error('Garantía no encontrada.', 404)
  const { row: warranty, hash, legacy } = await buscarPorTokenPublico(
    token,
    (publicTokenHash) => prisma.warrantyCase.findUnique({ where: { publicTokenHash }, select: SELECT }),
    (publicToken) => prisma.warrantyCase.findUnique({ where: { publicToken }, select: SELECT }),
  )
  if (!warranty) return error('Garantía no encontrada.', 404)
  // Backfill del hash para enlaces legacy: no invalida el QR ya impreso.
  if (legacy && hash) {
    await prisma.warrantyCase.updateMany({ where: { id: warranty.id, publicTokenHash: null }, data: { publicTokenHash: hash } }).catch(() => {})
  }
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
