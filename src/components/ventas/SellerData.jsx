import { useEffect, useState } from 'react'
import { api } from '@/lib/api/client'
import { Button } from '@/components/ui'

// Callers project explicit public fields before retaining API data in state.
export function useSellerData(path, project, demoRead, esDemo) {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState({ rows: [], loading: true, error: '' })
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    setState({ rows: [], loading: true, error: '' })
    Promise.resolve().then(() => esDemo ? demoRead() : api.get(path, { signal: controller.signal }))
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('Respuesta inválida')
        if (active) setState({ rows: data.map(project), loading: false, error: '' })
      }).catch((error) => {
        if (active) setState({ rows: [], loading: false, error: [401, 403].includes(error?.status)
          ? 'Tu sesión no tiene acceso. Volvé a ingresar o consultá al responsable.'
          : 'No se pudieron cargar los datos. Intentá de nuevo.' })
      })
    return () => { active = false; controller.abort() }
  }, [path, project, demoRead, esDemo, revision])
  return { ...state, refresh: () => setRevision((value) => value + 1) }
}

export function SellerSection({ title, description, children }) {
  return <section className="space-y-5">
    <div><h1 className="text-2xl font-bold tracking-tight">{title}</h1><p className="mt-1.5 text-sm text-mute">{description}</p></div>
    {children}
  </section>
}

export function SellerFeedback({ loading, error, empty, refresh }) {
  if (loading) return <div role="status" className="space-y-2 py-4" aria-busy="true"><span className="block h-14 animate-pulse rounded-xl bg-ink-700" /><span className="block h-14 animate-pulse rounded-xl bg-ink-700" /><span className="block h-14 animate-pulse rounded-xl bg-ink-700" /></div>
  if (error) return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad"><p>{error}</p><Button variant="outline" onClick={refresh}>Reintentar</Button></div>
  if (empty) return <div role="status" className="rounded-2xl border border-fore/10 bg-ink-800/30 p-8 text-center text-mute">No hay resultados.</div>
  return null
}
