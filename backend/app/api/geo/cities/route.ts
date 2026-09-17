import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { searchCities } from '../../../../lib/geo'

// Sugerencias de ciudad con su departamento para el autocompletado.
// Fuente única: el catálogo oficial de municipios sembrado en la base (262).
// AEX se usa solo para cotizar y seguir envíos, no para direcciones.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 120)
  const rows = await prisma.geoCity.findMany({ select: { name: true, department: true } })
  return json(searchCities(rows, q))
}
