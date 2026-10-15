import { prisma } from '../../../../../../lib/prisma'
import { error } from '../../../../../../lib/http'
import { enforceRateLimit } from '../../../../../../lib/rate-limit'
import { readAttachment } from '../../../../../../lib/attachment-storage'
import { SLUG_VALIDO } from '../../../../../../lib/public-policies'

const EXTENSION: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

// Logo de la empresa para sus páginas públicas de políticas (#433), por slug.
// Es el mismo logo que ya muestran las páginas públicas del pedido.
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const limited = enforceRateLimit(request, 'public-policies-logo', 60, 60_000)
  if (limited) return limited
  const { slug } = await context.params
  const clave = String(slug || '').toLowerCase()
  if (!SLUG_VALIDO.test(clave)) return error('Tienda no encontrada.', 404)
  const tenant = await prisma.tenant.findFirst({ where: { slug: clave, archivedAt: null }, select: { id: true } })
  if (!tenant) return error('Tienda no encontrada.', 404)
  const pedida = new URL(request.url).searchParams.get('variant') === 'dark' ? 'dark' : 'light'
  const otra = pedida === 'dark' ? 'light' : 'dark'
  const logo = (await prisma.tenantLogo.findUnique({ where: { tenantId_variant: { tenantId: tenant.id, variant: pedida } } }))
    || (await prisma.tenantLogo.findUnique({ where: { tenantId_variant: { tenantId: tenant.id, variant: otra } } }))
  if (!logo) return error('La empresa todavía no tiene logo.', 404)
  const bytes = await readAttachment({ storageKey: logo.storageKey, data: logo.data ?? new Uint8Array() })
  return new Response(bytes, {
    headers: {
      'Content-Type': logo.mimeType,
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': `inline; filename="logo.${EXTENSION[logo.mimeType] || 'png'}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=60',
    },
  })
}
