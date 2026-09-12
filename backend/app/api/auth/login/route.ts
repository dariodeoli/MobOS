import { authenticateCompany } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { COOKIE_COMPANY, sessionCookieOptions } from '../../../../lib/google-oauth'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return error('No se pudo iniciar sesión. Revisá tus datos e intentá nuevamente.', 400)
  if (!body.email || !body.password || !body.deviceId) return error('Correo, contraseña y dispositivo son obligatorios.', 400)
  const result = await authenticateCompany(body)
  if (!result) return error('Credenciales inválidas.', 401)
  const response = json({ expiresAt: result.expiresAt, tenant: result.tenant, sellers: result.sellers, scope: result.scope })
  response.cookies.set(COOKIE_COMPANY, result.accessToken, sessionCookieOptions(7 * 24 * 60 * 60))
  return response
}
