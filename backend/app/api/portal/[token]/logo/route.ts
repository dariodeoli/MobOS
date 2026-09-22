import { prisma } from '../../../../../lib/prisma'
import { error } from '../../../../../lib/http'
import { readAttachment } from '../../../../../lib/attachment-storage'
import { buscarPorTokenPublico } from '../../../../../lib/public-token'

const EXTENSION: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

// Logo de la empresa para el resumen público del cliente. Solo se entrega si
// el token del portal es válido y vigente: el logo no es enumerable.
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  if (!token || token.length > 200) return error('Cuenta no encontrada.', 404)
  // El token público viaja hasheado (#178): se resuelve con el mismo buscador
  // que el resto de las rutas públicas (hash vigente o token legacy).
  const { row: portal } = await buscarPorTokenPublico(
    token,
    (tokenHash) => prisma.customerPortalToken.findFirst({ where: { tokenHash, revokedAt: null }, select: { tenantId: true } }),
    (legacyToken) => prisma.customerPortalToken.findFirst({ where: { token: legacyToken, revokedAt: null }, select: { tenantId: true } }),
  )
  if (!portal) return error('Cuenta no encontrada.', 404)
  // Regla por tema (#186): la variante pedida manda (fondo claro → logo oscuro;
  // fondo oscuro → logo claro) y, si la empresa solo subió una, se entrega esa.
  const pedida = new URL(request.url).searchParams.get('variant') === 'dark' ? 'dark' : 'light'
  const otra = pedida === 'dark' ? 'light' : 'dark'
  const logo = await prisma.tenantLogo.findUnique({ where: { tenantId_variant: { tenantId: portal.tenantId, variant: pedida } } })
    ?? await prisma.tenantLogo.findUnique({ where: { tenantId_variant: { tenantId: portal.tenantId, variant: otra } } })
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
