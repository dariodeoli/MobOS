import { NextResponse } from 'next/server'
import { authConfig, beginGoogle, cookieOptions, COOKIE_FLOW, COOKIE_IDENTITY } from '../../../../lib/google-oauth'

export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  try {
    if (new URL(request.url).searchParams.get('status') === '1') {
      authConfig()
      return NextResponse.json({ configured: true }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const flow = beginGoogle(new URL(request.url).searchParams.get('intent') || 'login')
    const response = NextResponse.redirect(flow.url)
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    response.cookies.set(COOKIE_FLOW, flow.cookie, cookieOptions())
    response.cookies.set(COOKIE_IDENTITY, '', cookieOptions(0))
    return response
  } catch {
    return NextResponse.json({ message: 'El acceso con Google todavía no está configurado en el servidor. Faltan credenciales o URL válidas.', code: 'not_configured' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
