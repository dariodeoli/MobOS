import { useCallback, useEffect, useRef, useState } from 'react'
import { resources } from '@/lib/api'
import { mapProductoApi } from '@/lib/storage'
import { useAlmacenRevision } from '@/hooks/useAlmacenRevision'

// #354 · Catálogo del POS paginado y buscado en el servidor.
// - Búsqueda con debounce: cada tecla no dispara una consulta.
// - Sin conexión (o si la consulta falla) `activo` pasa a false y el POS sigue
//   con el catálogo completo del espejo local, igual que antes.
// - Los costos nunca se piden aparte: el servidor ya los redacta por rol.

export const POS_TAMANO_PAGINA = 16
export const POS_DEBOUNCE_MS = 300

const enLinea = () => typeof navigator === 'undefined' || navigator.onLine !== false

export function usePosCatalogoServidor({ q = '', accesorio = '', habilitado = true, tamano = POS_TAMANO_PAGINA, debounceMs = POS_DEBOUNCE_MS } = {}) {
  const revision = useAlmacenRevision()
  const [consulta, setConsulta] = useState(() => q.trim())
  const [pagina, setPagina] = useState(1)
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [fallo, setFallo] = useState(false)
  const [conexion, setConexion] = useState(enLinea)
  const pedido = useRef(0)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const actualizar = () => setConexion(enLinea())
    window.addEventListener('online', actualizar)
    window.addEventListener('offline', actualizar)
    return () => {
      window.removeEventListener('online', actualizar)
      window.removeEventListener('offline', actualizar)
    }
  }, [])

  // Debounce de la búsqueda; una búsqueda nueva vuelve a la primera página.
  useEffect(() => {
    const limpia = q.trim()
    if (limpia === consulta) return undefined
    const t = setTimeout(() => {
      setConsulta(limpia)
      setPagina(1)
    }, debounceMs)
    return () => clearTimeout(t)
  }, [q, consulta, debounceMs])

  useEffect(() => {
    if (!habilitado || !conexion) return undefined
    const id = ++pedido.current
    setCargando(true)
    resources.products
      .page({ q: consulta, page: pagina, pageSize: tamano, accessoryCategory: accesorio })
      .then(res => {
        if (id !== pedido.current) return
        const items = Array.isArray(res?.items) ? res.items.map(mapProductoApi) : []
        setDatos({ items, total: Number(res?.total) || 0, pages: Math.max(1, Number(res?.pages) || 1), page: Number(res?.page) || pagina })
        setFallo(false)
        setCargando(false)
      })
      .catch(() => {
        if (id !== pedido.current) return
        setFallo(true)
        setCargando(false)
      })
    return () => {
      pedido.current += 1
    }
  }, [habilitado, conexion, consulta, pagina, tamano, revision, accesorio])

  // Cambiar de categoría vuelve a la primera página.
  useEffect(() => { setPagina(1) }, [accesorio])

  // Si la página pedida quedó vacía (se borraron productos), vuelve a la primera.
  useEffect(() => {
    if (datos && datos.items.length === 0 && pagina > 1) setPagina(1)
  }, [datos, pagina])

  const siguiente = useCallback(() => setPagina(p => p + 1), [])
  const anterior = useCallback(() => setPagina(p => Math.max(1, p - 1)), [])

  // `activo`: hay datos del servidor utilizables. Sin conexión o con error se
  // devuelve false y el llamador usa el catálogo local completo.
  const activo = Boolean(habilitado && conexion && !fallo && datos)
  return {
    activo,
    cargando: Boolean(habilitado && conexion && !fallo && (cargando || !datos)),
    items: activo ? datos.items : [],
    total: activo ? datos.total : 0,
    pagina: activo ? datos.page : 1,
    paginas: activo ? datos.pages : 1,
    consulta,
    siguiente,
    anterior,
    sinConexion: Boolean(habilitado && (!conexion || fallo)),
  }
}
