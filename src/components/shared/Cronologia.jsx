import { useEffect, useState } from 'react'
import { api } from '@/lib/api/client'
import Icon from '@/components/shared/Icon'
import { Button, EmptyState, Skeleton } from '@/components/ui'

// Un icono y un tono por tipo de evento; el backend de cada cronología decide
// el tipo y acá se comparte la presentación (productos, proveedores, etc.).
const EVENTOS = {
  product: { icon: 'box', tono: 'bg-fono/10 text-fono-light' },
  unit: { icon: 'box', tono: 'bg-ink-700 text-fore' },
  purchase: { icon: 'receipt', tono: 'bg-warn/10 text-warn' },
  payment: { icon: 'money', tono: 'bg-ok/10 text-ok' },
  price: { icon: 'money', tono: 'bg-ok/10 text-ok' },
  supplier: { icon: 'user', tono: 'bg-fono/10 text-fono-light' },
  audit: { icon: 'edit', tono: 'bg-ink-700 text-mute' },
}
const fechaHora = (value) => (value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : '—')

// Lista de eventos de { events: [{ type, action, createdAt, user, detail }] }
// más reciente primero, con carga bajo demanda: se pide al activarse y al
// reintentar. Mismo formato que la cronología del cliente.
export default function Cronologia({ endpoint, active = true, vacio = 'Sin actividad', descripcionVacio = 'Los movimientos aparecerán acá.' }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!active || !endpoint) return undefined
    let vivo = true
    setLoading(true)
    setError('')
    api
      .get(endpoint)
      .then((data) => { if (vivo) { setEvents(Array.isArray(data?.events) ? data.events : []); setLoading(false) } })
      .catch((cause) => {
        if (vivo) { setError(cause?.message || 'No se pudo cargar la cronología.'); setLoading(false) }
      })
    return () => { vivo = false }
  }, [active, endpoint, revision])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-mute">Movimientos más recientes primero.</p>
        <button type="button" disabled={loading} onClick={() => setRevision((value) => value + 1)} className="rounded-lg border border-ink-500 px-3 py-1.5 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore disabled:opacity-40">Actualizar</button>
      </div>
      {loading && (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      )}
      {!loading && error && (
        <EmptyState compact icon="alert" title="No se pudo cargar la cronología" description={error} action={<Button onClick={() => setRevision((value) => value + 1)}>Reintentar</Button>} />
      )}
      {!loading && !error && !events.length && <EmptyState compact icon="clock" title={vacio} description={descripcionVacio} />}
      {!loading && !error && events.length > 0 && (
        <ol className="space-y-2">
          {events.map((event) => {
            const estilo = EVENTOS[event.type] || { icon: 'clock', tono: 'bg-ink-700 text-mute' }
            return (
              <li key={event.id} className="flex gap-3 rounded-xl border border-ink-600 bg-ink-800 p-3">
                <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${estilo.tono}`}>
                  <Icon name={estilo.icon} className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <p className="text-sm font-semibold">{event.action}</p>
                    <p className="text-[11px] text-mute">{fechaHora(event.createdAt)}</p>
                  </div>
                  {event.detail && <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-mute">{event.detail}</p>}
                  <p className="mt-1 text-[11px] text-mute">{event.user?.name || 'Sistema'}</p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
