import { NextResponse } from 'next/server'
import { authConfig, AuthFlowError, cookieOptions, COOKIE_FLOW, COOKIE_IDENTITY, exchangeGoogle, matchesState, readCookie, seal, unseal } from '../../../../../lib/google-oauth'

export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  let config
  try { config = authConfig() } catch { return NextResponse.json({ message: 'Google no está configurado.' }, { status: 503 }) }
  const target = new URL('/login', config.app)
  let identityCookie = ''
  try {
    const params = new URL(request.url).searchParams
    const flow = unseal('flow', readCookie(request, COOKIE_FLOW))
    if (!matchesState(params.get('state') || '', flow.state)) throw new AuthFlowError('state', 'Solicitud inválida.')
    if (params.has('error')) throw new AuthFlowError('cancelled', 'Acceso cancelado.')
    const code = params.get('code')
    if (!code) throw new AuthFlowError('state', 'Solicitud inválida.')
    const identity = await exchangeGoogle(code, flow)
    identityCookie = seal('identity', { ...identity, intent: flow.intent })
    target.searchParams.set('google', 'ready')
  } catch (error) {
    target.searchParams.set('auth_error', error instanceof AuthFlowError ? error.code : 'identity')
  }
  const response = NextResponse.redirect(target)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.cookies.set(COOKIE_FLOW, '', cookieOptions(0))
  response.cookies.set(COOKIE_IDENTITY, identityCookie, cookieOptions(identityCookie ? 600 : 0))
  return response
}
