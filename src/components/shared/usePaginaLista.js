import { useEffect, useMemo, useState } from 'react'
import { rangoAcumulado, rangoPagina, TAMANO_PAGINA_DEFECTO } from './paginacion'

const CONSULTA_COMPACTA = '(max-width: 1100px)'

const coincide = (consulta) =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(consulta).matches

// Paginación local reutilizable.
// - modo 'paginas': Anterior / Siguiente (conserva cualquier selección externa).
// - modo 'mas': «Cargar más» acumula de a `tamano` elementos.
// `tamano` puede ser un número o { compacto, amplio } (compacto = celular).
// Al cambiar `items` o el tamaño efectivo la lista vuelve al principio.
export function usePaginaLista(items, { tamano = TAMANO_PAGINA_DEFECTO, modo = 'paginas', consulta = CONSULTA_COMPACTA } = {}) {
  const lista = Array.isArray(items) ? items : []
  const [compacto, setCompacto] = useState(() => coincide(consulta))
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const media = window.matchMedia(consulta)
    const actualizar = () => setCompacto(media.matches)
    actualizar()
    media.addEventListener('change', actualizar)
    return () => media.removeEventListener('change', actualizar)
  }, [consulta])
  const size = typeof tamano === 'object' && tamano ? (compacto ? tamano.compacto : tamano.amplio) : tamano
  const [pagina, setPagina] = useState(0)
  const [veces, setVeces] = useState(1)
  useEffect(() => {
    setPagina(0)
    setVeces(1)
  }, [items, size, modo])

  return useMemo(() => {
    const total = lista.length
    if (modo === 'mas') {
      const { fin, hayMas } = rangoAcumulado(total, (Number(size) || TAMANO_PAGINA_DEFECTO) * veces)
      return {
        modo, total, size, filas: lista.slice(0, fin), mostrados: fin, inicio: 0, hayMas,
        cargarMas: () => setVeces((valor) => valor + 1),
        paginas: 1, actual: 0, setPagina,
      }
    }
    const r = rangoPagina(total, pagina, size)
    return {
      modo, total, size: r.size, filas: lista.slice(r.inicio, r.fin), mostrados: r.fin - r.inicio, inicio: r.inicio,
      hayMas: r.actual + 1 < r.paginas, paginas: r.paginas, actual: r.actual, setPagina,
      desde: r.desde, hasta: r.hasta, cargarMas: () => {},
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, modo, size, pagina, veces])
}
