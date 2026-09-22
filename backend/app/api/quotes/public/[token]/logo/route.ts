import { prisma } from '../../../../../../lib/prisma'
import { error } from '../../../../../../lib/http'
import { readAttachment } from '../../../../../../lib/attachment-storage'

const EXTENSION: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

// Logo de la empresa para el comprobante público de la cotización. Solo se
// entrega si el token de la cotización es válido: el logo no es enumerable.
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  if (!token || token.length > 200) return error('Cotización no encontrada.', 404)
  const quote = await prisma.quote.findUnique({ where: { publicToken: token }, select: { tenantId: true } })
  if (!quote) return error('Cotización no encontrada.', 404)
  // Regla por tema (#186): la variante pedida manda (fondo claro → logo oscuro;
  // fondo oscuro → logo claro) y, si la empresa solo subió una, se entrega esa.
  const pedida = new URL(request.url).searchParams.get('variant') === 'dark' ? 'dark' : 'light'
  const otra = pedida === 'dark' ? 'light' : 'dark'
  const logo = await prisma.tenantLogo.findUnique({ where: { tenantId_variant: { tenantId: quote.tenantId, variant: pedida } } })
    ?? await prisma.tenantLogo.findUnique({ where: { tenantId_variant: { tenantId: quote.tenantId, variant: otra } } })
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
