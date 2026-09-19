import { prisma } from '../../../../../lib/prisma'
import { error } from '../../../../../lib/http'
import { readAttachment } from '../../../../../lib/attachment-storage'

const EXTENSION: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

// Logo de la empresa para el resumen público del cliente. Solo se entrega si
// el token del portal es válido y vigente: el logo no es enumerable.
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  if (!token || token.length > 200) return error('Cuenta no encontrada.', 404)
  const portal = await prisma.customerPortalToken.findFirst({ where: { token, revokedAt: null }, select: { tenantId: true } })
  if (!portal) return error('Cuenta no encontrada.', 404)
  const logo = await prisma.tenantLogo.findUnique({ where: { tenantId_variant: { tenantId: portal.tenantId, variant: 'light' } } })
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
