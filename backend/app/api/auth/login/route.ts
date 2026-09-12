import { authenticateCompany } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return error('No se pudo iniciar sesión. Revisá tus datos e intentá nuevamente.', 400)
  if (!body.email || !body.password || !body.deviceId) return error('Correo, contraseña y dispositivo son obligatorios.', 400)
  const result = await authenticateCompany(body)
  if (!result) return error('Credenciales inválidas.', 401)
  return json({ companyToken: result.accessToken, expiresAt: result.expiresAt, tenant: result.tenant, sellers: result.sellers, scope: result.scope })
}
