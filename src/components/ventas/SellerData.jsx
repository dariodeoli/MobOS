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
    <div><h1 className="text-2xl font-bold">{title}</h1><p className="mt-2 text-sm text-mute">{description}</p></div>
    {children}
  </section>
}

export function SellerFeedback({ loading, error, empty, refresh }) {
  if (loading) return <p role="status" className="py-6 text-mute">Cargando…</p>
  if (error) return <div role="alert" className="space-y-3 py-4"><p>{error}</p><Button onClick={refresh}>Reintentar</Button></div>
  if (empty) return <p role="status" className="rounded-xl border border-fore/10 p-6 text-mute">No hay resultados.</p>
  return null
}
