import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api/client'
import { Button } from '@/components/ui'

// Callers project explicit public fields before retaining API data in state.
// Carga paginada opcional: con `limit` pide la primera página y expone
// `cargarMas`/`hayMas` para seguir con el cursor del último id. Sin limit el
// comportamiento es el de siempre (trae todo de una).
export function useSellerData(path, project, demoRead, esDemo, options = {}) {
  const limit = options.limit
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState({ rows: [], loading: true, error: '' })
  const [page, setPage] = useState({ loading: false, hayMas: false })
  const conLimite = useCallback((extra = '') => {
    if (!limit) return path
    const separador = path.includes('?') ? '&' : '?'
    return `${path}${separador}limit=${limit}${extra}`
  }, [path, limit])
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    setState({ rows: [], loading: true, error: '' })
    setPage({ loading: false, hayMas: false })
    Promise.resolve().then(() => esDemo ? demoRead() : api.get(conLimite(), { signal: controller.signal }))
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('Respuesta inválida')
        if (!active) return
        setState({ rows: data.map(project), loading: false, error: '' })
        setPage({ loading: false, hayMas: Boolean(limit) && !esDemo && data.length >= limit })
      }).catch((error) => {
        if (active) setState({ rows: [], loading: false, error: [401, 403].includes(error?.status)
          ? 'Tu sesión no tiene acceso. Volvé a ingresar o consultá al responsable.'
          : 'No se pudieron cargar los datos. Intentá de nuevo.' })
      })
    return () => { active = false; controller.abort() }
  }, [path, project, demoRead, esDemo, revision, limit, conLimite])
  const cargarMas = async () => {
    if (!limit || page.loading) return
    const ultimo = state.rows[state.rows.length - 1]?.id
    if (!ultimo) return
    setPage({ loading: true, hayMas: page.hayMas })
    try {
      const data = await api.get(conLimite(`&cursor=${encodeURIComponent(ultimo)}`))
      if (!Array.isArray(data)) throw new Error('Respuesta inválida')
      setState((actual) => ({ ...actual, rows: [...actual.rows, ...data.map(project)] }))
      setPage({ loading: false, hayMas: data.length >= limit })
    } catch {
      setPage({ loading: false, hayMas: page.hayMas })
    }
  }
  return { ...state, hayMas: page.hayMas, cargandoMas: page.loading, cargarMas, refresh: () => setRevision((value) => value + 1) }
}

export function SellerSection({ title, description, children }) {
  // El título lo muestra el shell (topbar): acá queda solo accesible para
  // lectores de pantalla y para los tests, sin repetirlo visualmente (#57).
  return <section className="space-y-4">
    <div><h1 className="sr-only">{title}</h1><p className="text-sm text-mute">{description}</p></div>
    {children}
  </section>
}

export function SellerFeedback({ loading, error, empty, refresh }) {
  if (loading) return <div role="status" className="space-y-2 py-4" aria-busy="true"><span className="block h-14 animate-pulse rounded-xl bg-ink-700" /><span className="block h-14 animate-pulse rounded-xl bg-ink-700" /><span className="block h-14 animate-pulse rounded-xl bg-ink-700" /></div>
  if (error) return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad"><p>{error}</p><Button variant="outline" onClick={refresh}>Reintentar</Button></div>
  if (empty) return <div role="status" className="rounded-2xl border border-fore/10 bg-ink-800/30 p-8 text-center text-mute">No hay resultados.</div>
  return null
}
