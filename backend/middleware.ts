import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { MOBOS_ALLOWED_APP_ORIGINS, MOBOS_IDENTITY, MOBOS_IDENTITY_HEADERS, MOBOS_LEGACY_API_HOSTS } from './lib/identity'

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host')?.split(':')[0]?.toLowerCase()
  if (hostname && MOBOS_LEGACY_API_HOSTS.has(hostname)) {
    const destino = new URL(request.url)
    destino.protocol = 'https:'
    destino.host = new URL(MOBOS_IDENTITY.urls.api).host
    destino.port = ''
    return NextResponse.redirect(destino, 308)
  }

  const origin = request.headers.get('origin') || ''
  const response = request.method === 'OPTIONS' ? new NextResponse(null, { status: 204 }) : NextResponse.next()
  if ((MOBOS_ALLOWED_APP_ORIGINS as readonly string[]).includes(origin)) response.headers.set('Access-Control-Allow-Origin', origin)
  response.headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-tenant-id, Idempotency-Key')
  response.headers.set('Vary', 'Origin')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  // Defensa en profundidad para toda respuesta del API. La autorización vive
  // en cada ruta; estos encabezados reducen vectores del navegador sin
  // flexibilizar CORS ni exponer información de sesión.
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), notifications=()')
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  for (const [name, value] of Object.entries(MOBOS_IDENTITY_HEADERS)) response.headers.set(name, value)
  return response
}

export const config = { matcher: '/api/:path*' }
