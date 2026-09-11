import { revokeSession } from '../../../../lib/auth'
import { json } from '../../../../lib/http'

export async function POST(request: Request) {
  await revokeSession(request)
  return json({ ok: true })
}
