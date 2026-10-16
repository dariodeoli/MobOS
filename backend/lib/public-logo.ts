import { prisma } from './prisma'
import { error } from './http'
import { readAttachment } from './attachment-storage'

// Solo recibe tenantId obtenido de la autorización del documento público;
// nunca un id elegido por querystring. Sin caché persistente tras revocar enlace.
export async function logoDelDocumentoPublico(request: Request, tenantId: string) {
  const variant = new URL(request.url).searchParams.get('variant') === 'dark' ? 'dark' : 'light'
  const other = variant === 'dark' ? 'light' : 'dark'
  const logo = await prisma.tenantLogo.findUnique({ where: { tenantId_variant: { tenantId, variant } } })
    || await prisma.tenantLogo.findUnique({ where: { tenantId_variant: { tenantId, variant: other } } })
  if (!logo || !['image/png', 'image/jpeg', 'image/webp'].includes(logo.mimeType)) {
    const response = error('La empresa todavía no tiene un logo disponible.', 404)
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
  const bytes = await readAttachment({ storageKey: logo.storageKey, data: logo.data ?? new Uint8Array() })
  return new Response(bytes, { headers: { 'Content-Type': logo.mimeType, 'Content-Length': String(bytes.byteLength), 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } })
}
