// Búsqueda de ciudades de Paraguay sobre el catálogo sembrado en la base
// (GeoCity). No depende de APIs externas: la migración 20260915230000 carga
// los 263 municipios con su departamento.

export type GeoRow = { name: string; department: string }

// Normaliza para comparar sin acentos, mayúsculas ni espacios extra.
const norm = (value: string) => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

export function searchCities(rows: GeoRow[], query: string, limit = 10) {
  const q = norm(query)
  if (q.length < 2) return []
  return rows
    .filter(({ name, department }) => norm(name).includes(q) || norm(department).includes(q))
    .sort((a, b) => {
      const aStart = norm(a.name).startsWith(q) ? 0 : 1
      const bStart = norm(b.name).startsWith(q) ? 0 : 1
      return aStart - bStart || a.name.localeCompare(b.name)
    })
    .slice(0, limit)
    .map(({ name, department }) => ({ city: name, department }))
}
