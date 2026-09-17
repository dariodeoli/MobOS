import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, EmptyState, Input, Skeleton, useToast } from '@/components/ui'
import { api } from '@/lib/api/client'
import { gs } from '@/utils/calculos'

const TIPO_LABEL = { WHOLESALE: 'Pasar a mayorista', CREDIT: 'Habilitar crédito' }

// Bandeja de solicitudes comerciales: el vendedor pide, administración o
// gerencia aprueba (pudiendo ajustar las condiciones) o rechaza.
export default function SolicitudesCliente() {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [dias, setDias] = useState({})
  const [limites, setLimites] = useState({})

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await api.get('/api/customer-requests?status=PENDING')
      setRows(Array.isArray(data) ? data : [])
    } catch (cause) { setError(cause?.message || 'No se pudieron cargar las solicitudes.') } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  async function resolver(row, approve) {
    if (busy) return
    setBusy(row.id); setError('')
    try {
      await api.patch('/api/customer-requests', {
        id: row.id,
        approve,
        ...(row.type === 'CREDIT' && approve
          ? { creditDays: dias[row.id] ?? row.requestedCreditDays ?? 0, creditLimitPyg: limites[row.id] ?? row.requestedCreditLimitPyg ?? 0 }
          : {}),
      })
      toast.success(approve ? 'Solicitud aprobada.' : 'Solicitud rechazada.')
      await load()
    } catch (cause) { setError(cause?.message || 'No se pudo resolver la solicitud.') } finally { setBusy('') }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Configuración</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">Solicitudes del cliente</h2>
          <p className="mt-1 text-sm text-mute">Cambios de tipo comercial y crédito pedidos por el equipo. Al aprobar se aplican a la ficha y quedan en su cronología.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>Actualizar</Button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{error}</p>}
      {loading && <div className="space-y-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>}
      {!loading && !rows.length && <EmptyState icon="check" title="No hay solicitudes pendientes." />}
      {!loading && rows.map(row => (
        <article key={row.id} className="rounded-xl border border-ink-600 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0">
              <b className="block truncate text-sm">{row.customerName}</b>
              <span className="mt-0.5 block text-xs text-mute">
                {TIPO_LABEL[row.type] || row.type} · pidió {row.requestedByName || 'el equipo'}
                {row.type === 'CREDIT' ? ` · ${row.requestedCreditDays ?? 0} días · ${gs(row.requestedCreditLimitPyg || 0)}` : ''}
              </span>
            </span>
            <Badge color="orange">Pendiente</Badge>
          </div>
          {row.note && <p className="mt-1 text-xs text-mute">{row.note}</p>}
          {row.type === 'CREDIT' && (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="block w-28 space-y-1 text-[11px] text-mute"><span>Días autorizados</span>
                <Input aria-label={`Días autorizados para ${row.customerName}`} inputMode="numeric" className="h-9" value={dias[row.id] ?? row.requestedCreditDays ?? ''} onChange={event => setDias(current => ({ ...current, [row.id]: event.target.value.replace(/\D/g, '').slice(0, 3) }))} />
              </label>
              <label className="block w-40 space-y-1 text-[11px] text-mute"><span>Límite autorizado (Gs)</span>
                <Input aria-label={`Límite autorizado para ${row.customerName}`} inputMode="numeric" className="h-9" value={limites[row.id] ?? row.requestedCreditLimitPyg ?? ''} onChange={event => setLimites(current => ({ ...current, [row.id]: event.target.value.replace(/\D/g, '').slice(0, 10) }))} />
              </label>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={busy === row.id} onClick={() => resolver(row, true)}>Aprobar</Button>
            <Button variant="ghost" disabled={busy === row.id} onClick={() => resolver(row, false)}>Rechazar</Button>
          </div>
        </article>
      ))}
    </Card>
  )
}
