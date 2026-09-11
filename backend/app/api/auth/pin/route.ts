import { authenticateSeller } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'

export async function POST(request: Request) {
  const body = await request.json()
  if (!body.pin) return error('El PIN es obligatorio.', 400)
  if (!body.sellerId && !body.userId) return error('El vendedor es obligatorio.', 400)
  const result = await authenticateSeller(request, body)
  if (!result) return error('PIN inválido.', 401)
  return json({ accessToken: result.accessToken, user: result.user })
}
