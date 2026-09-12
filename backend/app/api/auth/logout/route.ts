import { revokeSession } from '../../../../lib/auth'
import { json } from '../../../../lib/http'
import { COOKIE_COMPANY, cookieOptions, readCookie, sameOrigin } from '../../../../lib/google-oauth'

export async function POST(request: Request) {
  if (!request.headers.get('authorization') && readCookie(request, COOKIE_COMPANY) && !sameOrigin(request)) return json({ message: 'Origen no permitido.' }, { status: 403 })
  await revokeSession(request)
  const response = json({ ok: true })
  if (!request.headers.get('authorization') && readCookie(request, COOKIE_COMPANY)) response.cookies.set(COOKIE_COMPANY, '', cookieOptions(0))
  return response
}
