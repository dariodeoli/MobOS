import { revokeSession } from '../../../../lib/auth'
import { json } from '../../../../lib/http'
import { COOKIE_COMPANY, COOKIE_SELLER, sessionCookieOptions, readCookie, sameOrigin } from '../../../../lib/google-oauth'

export async function POST(request: Request) {
  if (!request.headers.get('authorization') && (readCookie(request, COOKIE_COMPANY) || readCookie(request, COOKIE_SELLER)) && !sameOrigin(request)) return json({ message: 'Origen no permitido.' }, { status: 403 })
  await revokeSession(request)
  const response = json({ ok: true })
  if (!request.headers.get('authorization')) {
    if (readCookie(request, COOKIE_COMPANY)) response.cookies.set(COOKIE_COMPANY, '', sessionCookieOptions(0))
    if (readCookie(request, COOKIE_SELLER)) response.cookies.set(COOKIE_SELLER, '', sessionCookieOptions(0))
  }
  return response
}
