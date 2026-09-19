import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { Badge, Card, EmptyState, Money, Skeleton } from '@/components/ui'
import { cn } from '@/lib/utils'

// Tabla compacta: una fila por cliente, con el uso del límite en su columna.
const GRID_CREDITOS = 'grid min-w-[56rem] grid-cols-[minmax(9rem,1.4fr)_5rem_6rem_minmax(7rem,0.9fr)_7rem_7rem_7rem] items-center gap-x-2'
const CELDA_CREDITOS = 'truncate text-[10px] font-bold uppercase tracking-wider text-mute'
const fechaCorta = (value) => {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }).replace('.', '')
}

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
            <h2 className="font-bold">Créditos y días de mora</h2>
            <p className="mt-1 text-sm text-mute">Pendiente por cliente, límite configurado y atraso en días. Los vencimientos se cargan desde cada venta a crédito.</p>
          </div>
          <button type="button" className="rounded-lg border border-fono/40 px-3 py-2 text-xs font-semibold text-fono-light" onClick={load} disabled={busy}>{busy ? 'Cargando…' : 'Actualizar'}</button>
        </div>
        {error && <p role="alert" className="mt-3 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-ink-600 p-3"><p className="text-xs text-mute">Total por cobrar</p><strong className="mt-1 block text-lg tabular-nums"><Money value={totals.outstandingPyg} /></strong></div>
          <div className="rounded-xl border border-bad/25 bg-bad/5 p-3"><p className="text-xs text-mute">En mora</p><strong className="mt-1 block text-lg tabular-nums text-bad"><Money value={totals.overduePyg} /></strong></div>
          <div className="rounded-xl border border-ink-600 p-3"><p className="text-xs text-mute">Clientes con deuda</p><strong className="mt-1 block text-lg tabular-nums">{totals.customersWithDebt}</strong></div>
          <div className="rounded-xl border border-bad/25 bg-bad/5 p-3"><p className="text-xs text-mute">Clientes en mora</p><strong className="mt-1 block text-lg tabular-nums text-bad">{totals.overdueCustomers}</strong></div>
        </div>
      </Card>
      <Card>
        {busy && !data && <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>}
        {!busy && rows.length === 0 && <EmptyState compact icon="wallet" title="Sin créditos pendientes." description="Las ventas a crédito aparecerán acá con su vencimiento y días de atraso." />}
        <div className="overflow-x-auto" data-testid="creditos-tabla">
          <div className={cn(GRID_CREDITOS, 'px-3.5 pb-2 pt-1')}>
            <span className={CELDA_CREDITOS}>Cliente</span>
            <span className={CELDA_CREDITOS}>Pedidos</span>
            <span className={CELDA_CREDITOS}>Vence</span>
            <span className={CELDA_CREDITOS}>Límite</span>
            <span className={CELDA_CREDITOS}>Uso</span>
            <span className={cn(CELDA_CREDITOS, 'text-right')}>Pendiente</span>
            <span className={cn(CELDA_CREDITOS, 'text-right')}>En mora</span>
          </div>
          <div className="space-y-1">
          {rows.map(row => (
            <div key={row.customerId} data-testid="credito-fila" className={cn(GRID_CREDITOS, 'rounded-xl border bg-ink-800/40 px-3.5 py-2', TONE(row) === 'bad' ? 'border-bad/30 bg-bad/5' : TONE(row) === 'warn' ? 'border-warn/30 bg-warn/5' : 'border-ink-600')}>
              <span className="truncate text-[13px] font-semibold" title={row.name}>{row.name}{row.pricingTier === 'WHOLESALE' ? <Badge className="ml-2" color="blue">Mayorista</Badge> : null}</span>
              <span className="truncate text-xs tabular-nums text-mute">{row.pendingOrders}</span>
              <span className="truncate text-xs text-mute">{fechaCorta(row.oldestDueAt)}</span>
              <span className="truncate text-xs tabular-nums text-mute">{row.creditLimitPyg ? <Money value={row.creditLimitPyg} /> : 'sin límite'}</span>
              <span className="min-w-0">
                <span className="block truncate text-xs tabular-nums text-mute">{row.limitUsagePct !== null ? `${row.limitUsagePct}%` : '—'}{row.creditDays ? ` · ${row.creditDays} d` : ''}</span>
                {row.creditLimitPyg ? <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-ink-700"><span className={cn('block h-full rounded-full', row.limitUsagePct >= 80 ? 'bg-warn' : 'bg-ok')} style={{ width: `${row.limitUsagePct}%` }} /></span> : null}
              </span>
              <span className="truncate text-right text-[13px] font-semibold tabular-nums text-fore"><Money value={row.outstandingPyg} /></span>
              <span className={cn('truncate text-right text-xs font-semibold tabular-nums', row.overduePyg > 0 ? 'text-bad' : 'text-mute')}>{row.overduePyg > 0 ? <><Money value={row.overduePyg} /><span className="ml-1 font-normal text-mute" title={`${row.maxOverdueDays} día(s) de mora`}>({row.maxOverdueDays}d)</span></> : '—'}</span>
            </div>
          ))}
          </div>
        </div>
      </Card>
    </div>
  )
}
