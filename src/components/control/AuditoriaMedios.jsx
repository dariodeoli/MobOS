import { useEffect, useState } from 'react'
import { ETIQUETAS_MEDIO_PAGO } from '@/lib/constants'
import { api } from '@/lib/api'
import { listVentas } from '@/lib/storage'
import { construirDemoAuditoriaMedios } from '@/lib/demoAuditoria'
import { useSesion } from '@/lib/sesion'
import { formatGs } from '@/utils/moneda'
import { Aviso, Button, Card, EmptyState, Input } from '@/components/ui'

// Control interno de cierre: cuánto entró por cada medio de pago en la sucursal
// y el día elegidos, para contrastar contra el conteo físico al auditar.
export default function AuditoriaMedios() {
  const { esDemo, sucursal } = useSesion()
  const [fecha, setFecha] = useState(() => {
    try { return new Date().toLocaleDateString('sv') } catch { return '' }
  })
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [checked, setChecked] = useState({})

  async function load(next = fecha) {
    setBusy(true); setError('')
    try {
      // En la demo el control se arma con los cobros ficticios del día (#194).
      if (esDemo) { setData(construirDemoAuditoriaMedios({ ventas: listVentas(), fecha: next })); return }
      const params = new URLSearchParams()
      if (sucursal?.id) params.set('branchId', sucursal.id)
      if (next) params.set('date', next)
      setData(await api.get(`/api/cash/audit?${params}`))
    } catch (cause) { setError(cause?.message || 'No se pudo cargar el control de medios.') } finally { setBusy(false) }
  }
  useEffect(() => { load(fecha) }, [esDemo, sucursal?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const methods = data?.methods || []
  const total = data?.totals || { amountPyg: 0, count: 0 }
  const verificados = methods.filter(row => checked[row.method]).length
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold">Entradas por medio de pago</h3>
          <p className="mt-1 text-sm text-mute">Contá el físico de cada medio y marcá cuando coincida con el sistema. PIX incluye montos pendientes de pasar a la cuenta de la empresa.</p>
          {esDemo && <p className="mt-1 text-xs text-fono-light">Demo: cobros ficticios del día; las marcas se guardan en este navegador.</p>}
        </div>
        <form className="flex items-end gap-2" onSubmit={event => { event.preventDefault(); load(fecha) }}>
          <label className="text-xs text-mute">Día<Input type="date" className="mt-1" value={fecha} onChange={event => setFecha(event.target.value)} /></label>
          <Button type="submit" variant="outline" disabled={busy}>{busy ? 'Cargando…' : 'Cargar'}</Button>
        </form>
      </div>
      {error && <Aviso tono="error" className="mt-3">{error}</Aviso>}
      <div className="mt-4 space-y-2">
        {methods.map(row => (
          <article key={row.method} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 p-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{ETIQUETAS_MEDIO_PAGO[row.method] || row.method}</p>
              <p className="text-xs text-mute">{row.count} cobro{row.count === 1 ? '' : 's'} confirmado{row.count === 1 ? '' : 's'}{row.pendingAmountPyg > 0 ? ` · ${formatGs(row.pendingAmountPyg)} pendiente` : ''}{row.refundedAmountPyg > 0 ? ` · ${formatGs(row.refundedAmountPyg)} reembolsado` : ''}</p>
            </div>
            <div className="flex items-center gap-3">
              <strong className="text-lg tabular-nums">{formatGs(row.amountPyg)}</strong>
              <label className={`flex items-center gap-2 rounded-lg border px-2 py-1 text-xs font-semibold ${checked[row.method] ? 'border-ok/40 bg-ok/10 text-ok' : 'border-ink-500 text-mute'}`}>
                <input type="checkbox" className="h-4 w-4 accent-ok" checked={Boolean(checked[row.method])} onChange={event => setChecked(current => ({ ...current, [row.method]: event.target.checked }))} />
                Coincide
              </label>
            </div>
          </article>
        ))}
        {!methods.length && !busy && <EmptyState compact icon="box" title="Sin cobros confirmados para este día" description="Elegí otro día o esperá cobros confirmados para controlar el cierre." />}
        {methods.length > 0 && (
          <p className="rounded-xl bg-fono/10 px-3 py-2 text-right text-sm">
            Total del día: <strong className="tabular-nums">{formatGs(total.amountPyg)}</strong> · verificados {verificados}/{methods.length}
          </p>
        )}
      </div>
    </Card>
  )
}
