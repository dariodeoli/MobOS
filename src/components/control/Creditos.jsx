import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { Aviso, BarraProgreso, Badge, Button, Card, EmptyState, Money, Skeleton } from '@/components/ui'
import { cn } from '@/lib/utils'
import { temaV2Activo } from '@/lib/temaV2'
import { CELDA_IDENTIDAD } from '@/components/shared/tabla'
import ListaDensa from '@/components/shared/ListaDensa'
import { usePaginaLista } from '@/components/shared/usePaginaLista'
import StatusChip from '@/components/shared/StatusChip'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'
import './finanzasTactil.css'
// Listado: una fila por cliente (tabla desde xl, tarjeta debajo), con el uso del límite.
const fechaCorta = (value) => {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }).replace('.', '')
}

function Cliente({ row }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      <span className={CELDA_IDENTIDAD} title={row.name}>{row.name}</span>
      {row.pricingTier === 'WHOLESALE' ? <StatusChip tono="neutral" etiqueta="Mayorista" /> : null}
    </span>
  )
}

function Uso({ row }) {
  return (
    <span className="block min-w-0">
      <span className="block truncate text-xs tabular-nums text-mute">{row.limitUsagePct !== null ? `${row.limitUsagePct}%` : '—'}{row.creditDays ? ` · ${row.creditDays} d` : ''}</span>
      {row.creditLimitPyg ? <BarraProgreso valor={row.limitUsagePct} tono={row.limitUsagePct >= 80 ? 'warn' : 'ok'} etiqueta="Uso del cupo de crédito" className="mt-1 bg-ink-700" /> : null}
    </span>
  )
}

function Mora({ row }) {
  if (!(row.overduePyg > 0)) return <span className="text-mute">—</span>
  return (
    <span className="text-bad">
      <Money value={row.overduePyg} />
      <span className="ml-1 font-normal text-mute" title={`${row.maxOverdueDays} día(s) de mora`}>({row.maxOverdueDays}d)</span>
    </span>
  )
}

const TONE = (row) => row.overduePyg > 0 ? 'bad' : row.limitUsagePct !== null && row.limitUsagePct >= 80 ? 'warn' : 'ok'

// Control de créditos y mora: pendiente por cliente, límite, uso y días de
// atraso. Es la pantalla de compliance para administración y caja.
export default function Creditos() {
  const { esDemo, sucursal } = useSesion()
  const v2 = temaV2Activo()
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
  const lista = usePaginaLista(rows, { tamano: { compacto: 5, amplio: 20 } })
  const totals = data?.totals || { outstandingPyg: 0, overduePyg: 0, customersWithDebt: 0, overdueCustomers: 0 }

  if (esDemo) return <Card><h2 className="font-bold">Créditos y mora</h2><p className="mt-2 text-sm text-mute">La demo no consume créditos reales. Ingresá con una cuenta real para ver el control de clientes a crédito.</p></Card>
  return (
    <div className="finanzas-tactil space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">Créditos y días de mora</h2>
            <p className="mt-1 text-sm text-mute">Pendiente por cliente, límite configurado y atraso en días. Los vencimientos se cargan desde cada venta a crédito.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data?.truncado && <Badge color="orange">Primeros 200 clientes</Badge>}
            <Button type="button" variant="outline" onClick={load} disabled={busy}>{busy ? 'Cargando…' : 'Actualizar'}</Button>
          </div>
        </div>
        {error && <Aviso tono="error" className="mt-3">{error}</Aviso>}
        {data?.truncado && (
          <p className="mt-3 text-xs text-mute">
            <Badge color="orange">Mostrando los primeros 200 clientes con deuda</Badge> Los totales de arriba incluyen a todos.
          </p>
        )}
        <div className={`mt-4 ${GRILLA_DOS_COLUMNAS} xl:grid-cols-4`} data-testid="creditos-resumen">
          <div className={cn('rounded-xl border border-ink-600 p-3', v2 && 'v2-tile')} data-testid="creditos-por-cobrar"><p className="text-xs text-mute">Total por cobrar</p><strong className={cn('mt-1 block tabular-nums', v2 ? 'v2-numero text-2xl' : 'text-lg')}><Money value={totals.outstandingPyg} /></strong></div>
          <div className={cn('rounded-xl border border-bad/25 bg-bad/5 p-3', v2 && 'v2-tile')} data-testid="creditos-en-mora"><p className="text-xs text-mute">En mora</p><strong className={cn('mt-1 block tabular-nums text-bad', v2 ? 'v2-numero text-2xl' : 'text-lg')}><Money value={totals.overduePyg} /></strong></div>
          <div className={cn('rounded-xl border border-ink-600 p-3', v2 && 'v2-tile')} data-testid="creditos-clientes"><p className="text-xs text-mute">Clientes con deuda</p><strong className={cn('mt-1 block tabular-nums', v2 ? 'v2-numero text-2xl' : 'text-lg')}>{totals.customersWithDebt}</strong></div>
          <div className={cn('rounded-xl border border-bad/25 bg-bad/5 p-3', v2 && 'v2-tile')} data-testid="creditos-clientes-mora"><p className="text-xs text-mute">Clientes en mora</p><strong className={cn('mt-1 block tabular-nums text-bad', v2 ? 'v2-numero text-2xl' : 'text-lg')}>{totals.overdueCustomers}</strong></div>
        </div>
      </Card>
      <Card>
        {busy && !data && <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>}
        {!busy && rows.length === 0 && <EmptyState compact icon="wallet" title="Sin créditos pendientes" description="Las ventas a crédito aparecerán acá con su vencimiento y días de atraso." />}
        <ListaDensa
          lista={lista}
          testId="creditos-tabla"
          etiquetaTabla="Créditos y mora por cliente"
          etiquetaPie="Páginas de clientes"
          unidad="clientes"
          desde="xl"
          obtenerClave={(row) => row.customerId}
          atributosFila={() => ({ 'data-testid': 'credito-fila' })}
          columns={[
            { key: 'cliente', header: 'Cliente', ancho: 'minmax(0,1.4fr)', className: 'overflow-visible', cell: (row) => <Cliente row={row} /> },
            { key: 'pedidos', header: 'Pedidos', ancho: '4.5rem', align: 'right', className: 'text-xs text-mute', cell: (row) => row.pendingOrders },
            { key: 'vence', header: 'Vence', ancho: '5.5rem', className: 'text-xs text-mute', cell: (row) => fechaCorta(row.oldestDueAt) },
            { key: 'limite', header: 'Límite', ancho: 'minmax(6.5rem,0.8fr)', align: 'right', className: 'text-xs text-mute', cell: (row) => (row.creditLimitPyg ? <Money value={row.creditLimitPyg} /> : 'sin límite') },
            { key: 'uso', header: 'Uso', ancho: 'minmax(7rem,0.9fr)', className: 'overflow-visible', cell: (row) => <Uso row={row} /> },
            { key: 'pendiente', header: 'Pendiente', ancho: 'minmax(7rem,0.8fr)', align: 'right', className: 'text-[13px] font-semibold text-fore', cell: (row) => <Money value={row.outstandingPyg} /> },
            { key: 'mora', header: 'En mora', ancho: 'minmax(8rem,0.9fr)', align: 'right', className: 'text-xs font-semibold', cell: (row) => <Mora row={row} /> },
          ]}
          renderCard={(row) => (
            <div className={cn('rounded-xl border bg-ink-800/40 p-3', v2 && 'v2-tile', TONE(row) === 'bad' ? 'border-bad/30 bg-bad/5' : TONE(row) === 'warn' ? 'border-warn/30 bg-warn/5' : 'border-ink-600')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1"><Cliente row={row} /></div>
                <strong className="shrink-0 text-[13px] tabular-nums text-fore"><Money value={row.outstandingPyg} /></strong>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
                {[
                  ['Pedidos', row.pendingOrders],
                  ['Vence', fechaCorta(row.oldestDueAt)],
                  ['Límite', row.creditLimitPyg ? <Money value={row.creditLimitPyg} /> : 'sin límite'],
                  ['En mora', <Mora row={row} />],
                ].map(([rotulo, valor]) => (
                  <div key={rotulo} className="min-w-0">
                    <dt className="text-[11px] text-mute">{rotulo}</dt>
                    <dd className="break-words tabular-nums">{valor}</dd>
                  </div>
                ))}
                <div className="col-span-2 min-w-0"><dt className="text-[11px] text-mute">Uso del cupo</dt><dd><Uso row={row} /></dd></div>
              </dl>
            </div>
          )}
        />
      </Card>
    </div>
  )
}
