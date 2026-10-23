import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { creditosDemo } from '@/lib/demo/cobranza'
import { useSesion } from '@/lib/sesion'
import { Aviso, BarraProgreso, Badge, Button, EmptyState, Money, Skeleton, Stat } from '@/components/ui'
import StatGrid from '@/components/shared/StatGrid'
import BarraGestion from '@/components/shared/BarraGestion'
import { cn } from '@/lib/utils'
import { temaV2Activo } from '@/lib/temaV2'
import { CELDA_IDENTIDAD } from '@/components/shared/tabla'
import ListaDensa from '@/components/shared/ListaDensa'
import { usePaginaLista } from '@/components/shared/usePaginaLista'
import StatusChip from '@/components/shared/StatusChip'
import './finanzasTactil.css'
// Listado: una fila por cliente (tabla desde xl, tarjeta debajo), con el uso del límite.
const fechaCorta = (value) => {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }).replace('.', '').replace('-', ' ')
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
    if (esDemo) { setData(creditosDemo()); return }
    setBusy(true); setError('')
    try {
      const params = new URLSearchParams()
      if (sucursal?.id) params.set('branchId', sucursal.id)
      setData(await api.get(`/api/credits?${params}`))
    } catch (cause) { setError(cause?.message || 'No se pudo cargar el control de créditos.') } finally { setBusy(false) }
  }
  useEffect(() => { load() }, [esDemo, sucursal?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => data?.credits || [], [data])
  const [busqueda, setBusqueda] = useState('')
  const [tab, setTab] = useState('todos')
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return rows.filter((row) => {
      if (tab === 'mora' && !(row.overduePyg > 0)) return false
      if (tab === 'cupo' && !(row.limitUsagePct !== null && row.limitUsagePct >= 80)) return false
      if (tab === 'aldia' && (row.overduePyg > 0)) return false
      return !q || String(row.name || '').toLowerCase().includes(q)
    })
  }, [rows, busqueda, tab])
  const lista = usePaginaLista(visibles, { tamano: { compacto: 5, amplio: 20 } })
  const totals = data?.totals || { outstandingPyg: 0, overduePyg: 0, customersWithDebt: 0, overdueCustomers: 0 }

  return (
    <div className="gp ventas-f3 finanzas-tactil space-y-3">
      <div className="gp-cabecera">
        <div className="min-w-0">
          <h2>Créditos y días de mora</h2>
          {data?.truncado && <p className="mt-1 text-xs"><Badge color="orange">Mostrando los primeros 200 clientes con deuda</Badge> Los totales incluyen a todos.</p>}
        </div>
      </div>
      <BarraGestion
        etiqueta="Acciones de Créditos"
        testId="barra-creditos"
        buscar={busqueda}
        onBuscar={setBusqueda}
        placeholder="Buscar cliente"
        ariaBuscar="Buscar clientes con crédito"
        tabs={[['todos', 'Todos'], ['mora', 'En mora'], ['cupo', 'Cupo alto'], ['aldia', 'Al día']]}
        tab={tab}
        onTab={setTab}
        etiquetaTabs="Estado del crédito"
        primary={<Button type="button" variant="outline" onClick={load} disabled={busy}>{busy ? 'Cargando…' : 'Actualizar'}</Button>}
      />
      {error && <Aviso tono="error">{error}</Aviso>}
      <StatGrid testId="creditos-resumen">
        <Stat compact testId="creditos-por-cobrar" label="Total por cobrar" valor={<Money value={totals.outstandingPyg} />} />
        <Stat compact testId="creditos-en-mora" label="En mora" valor={<Money value={totals.overduePyg} />} valorClassName="text-bad" />
        <Stat compact testId="creditos-clientes" label="Clientes con deuda" valor={totals.customersWithDebt} />
        <Stat compact testId="creditos-clientes-mora" label="Clientes en mora" valor={totals.overdueCustomers} valorClassName="text-bad" />
      </StatGrid>
      <div>
        {busy && !data && <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>}
        {!busy && rows.length === 0 && <EmptyState compact icon="wallet" title="Sin créditos pendientes" description="Las ventas a crédito aparecerán acá con su vencimiento y días de atraso." action={<Button type="button" variant="outline" onClick={load}>Actualizar</Button>} />}
        {rows.length > 0 && visibles.length === 0 && <EmptyState compact icon="wallet" title="Ningún cliente coincide" description="Probá otra búsqueda o cambiá el estado." action={<Button type="button" variant="outline" onClick={() => { setBusqueda(''); setTab('todos') }}>Ver todos</Button>} />}
        <ListaDensa
          lista={lista}
          testId="creditos-tabla"
          etiquetaTabla="Créditos y mora por cliente"
          etiquetaPie="Páginas de clientes"
          unidad="clientes"
          desde="xl"
          obtenerClave={(row) => row.customerId}
          atributosFila={(row) => ({ 'data-testid': 'credito-fila', className: TONE(row) === 'bad' ? 'bg-bad/5' : TONE(row) === 'warn' ? 'bg-warn/5' : undefined })}
          columns={[
            { key: 'cliente', header: 'Cliente', ancho: 'minmax(0,1.4fr)', className: 'overflow-visible', cell: (row) => <Cliente row={row} /> },
            { key: 'pedidos', header: 'Pedidos', ancho: '4.5rem', align: 'right', className: 'text-xs text-mute', cell: (row) => row.pendingOrders },
            { key: 'vence', header: 'Vence', ancho: '5.5rem', className: 'text-xs text-mute', cell: (row) => fechaCorta(row.oldestDueAt) },
            { key: 'limite', dinero: true, header: 'Límite', ancho: 'minmax(8.5rem,0.8fr)', align: 'right', className: 'text-xs text-mute', cell: (row) => (row.creditLimitPyg ? <Money value={row.creditLimitPyg} /> : 'sin límite') },
            { key: 'uso', header: 'Uso', ancho: 'minmax(7rem,0.9fr)', className: 'overflow-visible', cell: (row) => <Uso row={row} /> },
            { key: 'pendiente', dinero: true, header: 'Pendiente', ancho: 'minmax(8.5rem,0.8fr)', align: 'right', className: 'text-[13px] font-semibold text-fore', cell: (row) => <Money value={row.outstandingPyg} /> },
            { key: 'mora', dinero: true, header: 'En mora', ancho: 'minmax(11rem,0.9fr)', align: 'right', className: 'text-xs font-semibold', cell: (row) => <Mora row={row} /> },
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
      </div>
    </div>
  )
}
