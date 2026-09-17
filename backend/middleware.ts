import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { logError } from './lib/log'
import { INTERNAL_CLIENT_IP_HEADER, INTERNAL_COOKIE_HEADER, INTERNAL_PASS_HEADER, INTERNAL_PASS_VALUE } from './lib/internal'
import { MOBOS_ALLOWED_APP_ORIGINS, MOBOS_IDENTITY, MOBOS_IDENTITY_HEADERS, MOBOS_LEGACY_API_HOSTS } from './lib/identity'

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/
// Cabeceras hop-by-hop: no se copian sobre la respuesta proxeada.
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'])

function resolveRequestId(request: NextRequest) {
  const incoming = request.headers.get('x-request-id')
  if (incoming && REQUEST_ID_PATTERN.test(incoming)) return incoming
  return globalThis.crypto.randomUUID()
}

// Next 14.2 ejecuta el middleware antes de la ruta y no permite observar la
// respuesta de `NextResponse.next()`. Para medir duración y registrar 5xx se
// reenvía la solicitud a la propia instancia (127.0.0.1:PORT) y se copia la
// respuesta hacia el cliente, aplicando el mismo contrato CORS/seguridad.
function internalOrigin(request: NextRequest) {
  const url = new URL(request.url)
  url.protocol = 'http:'
  url.host = `127.0.0.1:${process.env.PORT || url.port || '3000'}`
  return url
}

// Origen de app configurado por entorno (permite entornos aislados de e2e/CI).
function configuredAppOrigin() {
  const value = process.env.MOBOS_APP_URL
  if (!value) return ''
  try { return new URL(value).origin } catch { return '' }
}

function applyResponseHeaders(response: NextResponse, origin: string, requestId: string) {
  if (origin && ((MOBOS_ALLOWED_APP_ORIGINS as readonly string[]).includes(origin) || origin === configuredAppOrigin())) response.headers.set('Access-Control-Allow-Origin', origin)
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
  response.headers.set('X-Request-Id', requestId)
  for (const [name, value] of Object.entries(MOBOS_IDENTITY_HEADERS)) response.headers.set(name, value)
  return response
}

async function proxyPass(request: NextRequest, requestHeaders: Headers, requestId: string, origin: string, startedAt: number) {
  const method = request.method
  const path = new URL(request.url).pathname
  const forwardHeaders = new Headers(requestHeaders)
  forwardHeaders.delete('host')
  // La cookie no sobrevive al fetch interno (undici la descarta): viaja por
  // un header propio. La IP real del cliente se preserva aparte porque el
  // salto interno se presenta con 127.0.0.1 en X-Forwarded-For.
  const cookie = forwardHeaders.get('cookie')
  const clientIp = forwardHeaders.get('x-forwarded-for') || ''
  forwardHeaders.delete('cookie')
  forwardHeaders.delete(INTERNAL_COOKIE_HEADER)
  if (cookie) forwardHeaders.set(INTERNAL_COOKIE_HEADER, cookie)
  forwardHeaders.delete('x-forwarded-for')
  forwardHeaders.set('x-forwarded-for', '127.0.0.1')
  forwardHeaders.delete(INTERNAL_CLIENT_IP_HEADER)
  if (clientIp) forwardHeaders.set(INTERNAL_CLIENT_IP_HEADER, clientIp)
  forwardHeaders.set(INTERNAL_PASS_HEADER, INTERNAL_PASS_VALUE)
  const init: RequestInit = { method, headers: forwardHeaders, redirect: 'manual' }
  if (request.body && method !== 'GET' && method !== 'HEAD') {
    init.body = request.body
    // lib.dom del TS instalado no declara `duplex` en RequestInit.
    ;(init as { duplex?: 'half' }).duplex = 'half'
  }
  const upstream = await fetch(internalOrigin(request), init)
  const responseHeaders = new Headers()
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (HOP_BY_HOP.has(lower) || lower === 'set-cookie') return
    responseHeaders.append(key, value)
  })
  // set-cookie se copia uno a uno para no fusionar varias cookies en un header.
  if (typeof upstream.headers.getSetCookie === 'function') {
    for (const cookie of upstream.headers.getSetCookie()) responseHeaders.append('set-cookie', cookie)
  }
  const status = upstream.status
  const body = status === 204 || status === 304 ? null : upstream.body
  const response = applyResponseHeaders(new NextResponse(body, { status, headers: responseHeaders }), origin, requestId)
  const ms = Date.now() - startedAt
  if (status >= 500) logError('request_error', { requestId, method, path, status, ms })
  // Diagnóstico temporal de accesos con cookie: un 401 inesperado en flujos
  // autenticados se registra con origen y presencia de cookies para poder
  // contrastar el contrato sameOrigin en producción.
  if (status === 401 && path.startsWith('/api/')) {
    logError('auth_401_diag', {
      requestId, method, path, ms,
      origin: request.headers.get('origin') || null,
      host: request.headers.get('host') || null,
      hasSellerCookie: /(^|;\s*)mobos_seller_session=/.test(request.headers.get('cookie') || ''),
      hasCompanyCookie: /(^|;\s*)mobos_company_session=/.test(request.headers.get('cookie') || ''),
      hasBearer: /^Bearer\s+/i.test(request.headers.get('authorization') || ''),
      appUrl: process.env.MOBOS_APP_URL || null,
    })
  }
  return response
}

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host')?.split(':')[0]?.toLowerCase()
  if (hostname && MOBOS_LEGACY_API_HOSTS.has(hostname)) {
    const destino = new URL(request.url)
    destino.protocol = 'https:'
    destino.host = new URL(MOBOS_IDENTITY.urls.api).host
    destino.port = ''
    return applyResponseHeaders(NextResponse.redirect(destino, 308), request.headers.get('origin') || '', resolveRequestId(request))
  }

  const origin = request.headers.get('origin') || ''
  const requestId = resolveRequestId(request)
  const startedAt = Date.now()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-request-id', requestId)

  if (request.method === 'OPTIONS') {
    return applyResponseHeaders(new NextResponse(null, { status: 204 }), origin, requestId)
  }

  try {
    const peer = (requestHeaders.get('x-forwarded-for') || '').split(',')[0]?.trim() || ''
    if (peer === '127.0.0.1' && requestHeaders.get(INTERNAL_PASS_HEADER) === INTERNAL_PASS_VALUE) {
      return NextResponse.next({ request: { headers: requestHeaders } })
    }
    // Request externo (o marcador forjado): se limpia el canal interno y se
    // regenera en el salto.
    requestHeaders.delete(INTERNAL_PASS_HEADER)
    requestHeaders.delete(INTERNAL_COOKIE_HEADER)
    requestHeaders.delete(INTERNAL_CLIENT_IP_HEADER)
    return await proxyPass(request, requestHeaders, requestId, origin, startedAt)
  } catch (cause) {
    const ms = Date.now() - startedAt
    logError('middleware_error', { requestId, method: request.method, path: new URL(request.url).pathname, ms, error: cause instanceof Error ? cause.message : String(cause) })
    return applyResponseHeaders(new NextResponse('Internal Server Error', { status: 500 }), origin, requestId)
  }
}

export const config = { matcher: '/api/:path*' }
