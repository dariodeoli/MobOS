import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { searchCities } from '../../../../lib/geo'
import { aexCities } from '../../../../lib/aex'

// Sugerencias de ciudad con su departamento para el autocompletado.
// Fuente primaria: catálogo GeoCity en la base (sembrado por migración).
// Con credenciales AEX configuradas se usa el proveedor (ciudades con
// cobertura); ante cualquier fallo se cae al catálogo local.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 120)
  const aex = await aexCities(q)
  if (aex !== null) return json(aex)
  const rows = await prisma.geoCity.findMany({ select: { name: true, department: true } })
  return json(searchCities(rows, q))
}
