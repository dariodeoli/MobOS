import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { formatGs } from '@/utils/moneda'
import { Badge, Card, EmptyState, Eyebrow, Skeleton } from '@/components/ui'

const TONE = (row) => row.overduePyg > 0 ? 'bad' : row.limitUsagePct !== null && row.limitUsagePct >= 80 ? 'warn' : 'ok'

// Control de créditos y mora: pendiente por cliente, límite, uso y días de
// atraso. Es la pantalla de compliance para administración y caja.
export default function Creditos() {
  const { esDemo, sucursal } = useSesion()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    if (esDemo) return
    setBusy(true); setError('')
    try {
      const params = new URLSearchParams()
      if (sucursal?.id) params.set('branchId', sucursal.id)
      setData(await api.get(`/api/credits?${params}`))
    } catch (cause) { setError(cause?.message || 'No se pudo cargar el control de créditos.') } finally { setBusy(false) }
  }
  useEffect(() => { load() }, [esDemo, sucursal?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => data?.credits || [], [data])
  const totals = data?.totals || { outstandingPyg: 0, overduePyg: 0, customersWithDebt: 0, overdueCustomers: 0 }

  if (esDemo) return <Card><h2 className="font-bold">Créditos y mora</h2><p className="mt-2 text-sm text-mute">La demo no consume créditos reales. Ingresá con una cuenta real para ver el control de clientes a crédito.</p></Card>
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Eyebrow>Compliance</Eyebrow>
            <h2 className="mt-1 font-bold">Créditos y días de mora</h2>
            <p className="mt-1 text-sm text-mute">Pendiente por cliente, límite configurado y atraso en días. Los vencimientos se cargan desde cada venta a crédito.</p>
          </div>
          <button type="button" className="rounded-lg border border-fono/40 px-3 py-2 text-xs font-semibold text-fono-light" onClick={load} disabled={busy}>{busy ? 'Cargando…' : 'Actualizar'}</button>
        </div>
        {error && <p role="alert" className="mt-3 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-ink-600 p-3"><p className="text-xs text-mute">Total por cobrar</p><strong className="mt-1 block text-lg tabular-nums">{formatGs(totals.outstandingPyg)}</strong></div>
          <div className="rounded-xl border border-bad/25 bg-bad/5 p-3"><p className="text-xs text-mute">En mora</p><strong className="mt-1 block text-lg tabular-nums text-bad">{formatGs(totals.overduePyg)}</strong></div>
          <div className="rounded-xl border border-ink-600 p-3"><p className="text-xs text-mute">Clientes con deuda</p><strong className="mt-1 block text-lg tabular-nums">{totals.customersWithDebt}</strong></div>
          <div className="rounded-xl border border-bad/25 bg-bad/5 p-3"><p className="text-xs text-mute">Clientes en mora</p><strong className="mt-1 block text-lg tabular-nums text-bad">{totals.overdueCustomers}</strong></div>
        </div>
      </Card>
      <Card>
        {busy && !data && <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>}
        {!busy && rows.length === 0 && <EmptyState compact icon="wallet" title="Sin créditos pendientes." description="Las ventas a crédito aparecerán acá con su vencimiento y días de atraso." />}
        <div className="space-y-2">
          {rows.map(row => (
            <article key={row.customerId} className={`rounded-xl border p-3 ${TONE(row) === 'bad' ? 'border-bad/30 bg-bad/5' : TONE(row) === 'warn' ? 'border-warn/30 bg-warn/5' : 'border-ink-600'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{row.name}{row.pricingTier === 'WHOLESALE' ? <Badge className="ml-2" color="blue">Mayorista</Badge> : null}</p>
                  <p className="mt-1 text-xs text-mute">
                    {row.pendingOrders} pedido{row.pendingOrders === 1 ? '' : 's'} pendiente{row.pendingOrders === 1 ? '' : 's'} · vence más próximo {row.oldestDueAt ? new Date(row.oldestDueAt).toLocaleDateString('es-PY') : '—'}
                    {row.overduePyg > 0 && <span className="ml-2 font-semibold text-bad">en mora {row.maxOverdueDays} día{row.maxOverdueDays === 1 ? '' : 's'} · {formatGs(row.overduePyg)}</span>}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <strong className="block tabular-nums">{formatGs(row.outstandingPyg)}</strong>
                  <p className="text-[11px] text-mute">{row.creditLimitPyg ? `de ${formatGs(row.creditLimitPyg)} · ${row.limitUsagePct}%` : 'sin límite'}{row.creditDays ? ` · plazo ${row.creditDays} días` : ''}</p>
                </div>
              </div>
              {row.creditLimitPyg ? (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-700">
                  <div className={`h-full rounded-full ${row.limitUsagePct >= 80 ? 'bg-warn' : 'bg-ok'}`} style={{ width: `${row.limitUsagePct}%` }} />
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </Card>
    </div>
  )
}
