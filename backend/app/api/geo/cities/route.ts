import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { searchCities } from '../../../../lib/geo'

// Sugerencias de ciudad con su departamento para el autocompletado de clientes.
// La fuente es el dataset local de lib/geo.ts; si más adelante se integra AEX
// (ciudades con cobertura), se cambia la fuente sin tocar la interfaz.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 120)
  return json(searchCities(q))
}
