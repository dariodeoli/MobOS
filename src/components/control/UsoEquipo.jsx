import { useEffect, useState } from 'react'
import { Aviso, Badge, Button, Card, Skeleton } from '@/components/ui'
import { presenciaApi } from '@/lib/api/presence'
import { ROLE_LABELS } from '@/lib/roles'

const MINUTO = 60
const HORA = 60 * MINUTO

// Tiempo activo acumulado en formato corto: "3 h 25 min" / "42 min" / "< 1 min".
function tiempoActivo(segundos) {
  const total = Math.max(0, Number(segundos) || 0)
  if (total < MINUTO) return '< 1 min'
  const horas = Math.floor(total / HORA)
  const minutos = Math.round((total % HORA) / MINUTO)
  if (!horas) return `${minutos} min`
  return `${horas} h${minutos ? ` ${minutos} min` : ''}`
}

const fecha = (valor) => (valor ? new Date(valor).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : '—')

// Uso del equipo (últimos 30 días): solo el dueño. Primero el resumen por
// persona; al abrir una fila se ven sus últimas sesiones de trabajo.
export default function UsoEquipo() {
  const [people, setPeople] = useState([])
  const [days, setDays] = useState(30)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState(null)
  const [detalle, setDetalle] = useState([])
  const [detalleCargando, setDetalleCargando] = useState(false)

  async function cargar() {
    setCargando(true); setError('')
    try {
      const data = await presenciaApi.uso()
      setPeople(data?.people || [])
      setDays(Number(data?.days) || 30)
    } catch (cause) {
      setError(cause?.message || 'No se pudo cargar el uso del equipo.')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [])

  async function abrir(persona) {
    if (abierto === persona.id) { setAbierto(null); setDetalle([]); return }
    setAbierto(persona.id); setDetalle([]); setDetalleCargando(true)
    try {
      const data = await presenciaApi.uso(persona.id)
      setDetalle(data?.records || [])
    } catch {
      setDetalle([])
    } finally {
      setDetalleCargando(false)
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">Uso del equipo</h2>
          <p className="mt-1 text-sm text-mute">Tiempo de trabajo de los últimos {days} días. Solo lo ve el dueño de la cuenta.</p>
        </div>
        <Button variant="outline" onClick={cargar} disabled={cargando}>{cargando ? 'Actualizando…' : 'Actualizar'}</Button>
      </div>
      {error && <Aviso tono="error">{error}</Aviso>}
      {cargando && !people.length && <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>}
      {!cargando && !error && !people.length && <p className="text-sm text-mute">Todavía no hay actividad registrada en el período.</p>}
      <div className="space-y-2">
        {people.map(persona => (
          <div key={persona.id} className="rounded-xl border border-ink-600">
            <button
              type="button"
              onClick={() => abrir(persona)}
              aria-expanded={abierto === persona.id}
              className="flex w-full flex-wrap items-center justify-between gap-3 px-3 py-3 text-left transition hover:bg-ink-700/40"
            >
              <span className="flex min-w-0 items-center gap-2">
                {persona.online && <i className="h-2 w-2 shrink-0 rounded-full bg-ok" aria-label="En línea" />}
                <span className="min-w-0">
                  <span className="block truncate font-medium">{persona.name}</span>
                  <span className="mt-0.5 block text-xs text-mute">{ROLE_LABELS[persona.role] || persona.role || 'Integrante'} · última actividad {fecha(persona.lastSeenAt)}</span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-mute">
                <Badge color="slate">{persona.sessions} {persona.sessions === 1 ? 'sesión' : 'sesiones'}</Badge>
                <span className="font-semibold tabular-nums text-fore">{tiempoActivo(persona.activeSeconds)}</span>
              </span>
            </button>
            {abierto === persona.id && (
              <div className="border-t border-ink-600 px-3 py-2">
                {detalleCargando && <p className="py-2 text-xs text-mute">Cargando detalle…</p>}
                {!detalleCargando && !detalle.length && <p className="py-2 text-xs text-mute">Sin sesiones registradas.</p>}
                {detalle.map((registro, index) => (
                  <p key={index} className="flex flex-wrap items-center justify-between gap-2 py-1 text-xs text-mute">
                    <span>{fecha(registro.firstSeenAt)} → {fecha(registro.lastSeenAt)}</span>
                    <span className="tabular-nums">{tiempoActivo(registro.activeSeconds)}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
