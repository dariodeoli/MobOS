import { prisma } from '../../../../../../lib/prisma'
import { error } from '../../../../../../lib/http'
import { readAttachment } from '../../../../../../lib/attachment-storage'

const EXTENSION: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

// Logo de la empresa para las páginas públicas del pedido (rápido, completo y
// detallado). Viaja por la vía pública del pedido: solo se entrega con un token
// vigente o con el token histórico del pedido, nunca enumerable. La variante
// pedida manda; si la empresa solo subió una, se entrega esa.
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  if (!token || token.length > 200) return error('Pedido no encontrado.', 404)
  const acceso = await prisma.orderAccessToken.findFirst({
    where: { token, revokedAt: null },
    select: { orderId: true },
  })
  const order = await prisma.order.findFirst({
    where: acceso ? { id: acceso.orderId } : { publicToken: token },
    select: { tenantId: true },
  })
  if (!order) return error('Pedido no encontrado.', 404)

  const pedida = new URL(request.url).searchParams.get('variant') === 'dark' ? 'dark' : 'light'
  const otra = pedida === 'dark' ? 'light' : 'dark'
  const logo = await prisma.tenantLogo.findUnique({ where: { tenantId_variant: { tenantId: order.tenantId, variant: pedida } } })
    || await prisma.tenantLogo.findUnique({ where: { tenantId_variant: { tenantId: order.tenantId, variant: otra } } })
  if (!logo) return error('La empresa todavía no tiene logo.', 404)

  const bytes = await readAttachment({ storageKey: logo.storageKey, data: logo.data ?? new Uint8Array() })
  return new Response(bytes, {
    headers: {
      'Content-Type': logo.mimeType,
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': `inline; filename="logo.${EXTENSION[logo.mimeType] || 'png'}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=60',
    },
  })
}
