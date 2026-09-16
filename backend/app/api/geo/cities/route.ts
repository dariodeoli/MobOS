import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { searchCities } from '../../../../lib/geo'

// Sugerencias de ciudad con su departamento para el autocompletado.
// El catálogo vive en la tabla GeoCity (sembrada por migración), sin
// dependencia de APIs externas.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 120)
  const rows = await prisma.geoCity.findMany({ select: { name: true, department: true } })
  return json(searchCities(rows, q))
}
