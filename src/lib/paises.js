import { PAISES_TELEFONO } from 'owncoding-ui/phone'

// Países predeterminados de los selectores (#389): Paraguay primero y luego los
// que más usa el negocio. El resto se encuentra buscando por nombre.
export const PAISES_PREDETERMINADOS = Object.freeze(['PY', 'AR', 'BR', 'UY', 'BO', 'CL', 'US', 'ES'])

const sinAcentos = (texto) => String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase().trim()
const porIso = new Map(PAISES_TELEFONO.map((pais) => [pais.country, pais]))

export const nombrePais = (iso) => porIso.get(iso)?.name || iso
export const paisesPredeterminados = () => PAISES_PREDETERMINADOS.map((iso) => porIso.get(iso)).filter(Boolean).map(({ country, name }) => ({ country, name }))

// Búsqueda sin acentos por nombre o ISO sobre el catálogo completo.
export function buscarPaises(consulta, limite = 8) {
  const termino = sinAcentos(consulta)
  if (!termino) return paisesPredeterminados()
  return PAISES_TELEFONO
    .filter((pais) => sinAcentos(pais.name).includes(termino) || sinAcentos(pais.country) === termino)
    .sort((a, b) => Number(sinAcentos(b.name).startsWith(termino)) - Number(sinAcentos(a.name).startsWith(termino)))
    .slice(0, limite)
    .map(({ country, name }) => ({ country, name }))
}
