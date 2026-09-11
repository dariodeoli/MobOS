import { requireSession } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida o expirada.', 401)
  return json({ user: session.user })
}
