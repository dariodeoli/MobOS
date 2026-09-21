import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { ventaDesdeApi } from '@/lib/storage'
import { gs } from '@/utils/calculos'
import { formatMoney } from '@/utils/moneda'
import { PAYMENT_METHOD_LABELS } from '@/lib/constants'
import RangoFechas, { PRESETS, rangoDeParams, paramsDeRango } from '@/components/shared/RangoFechas'
import { Badge, Button, Card, EmptyState, Input, MoneyInput, Select, Skeleton, useToast } from '@/components/ui'
import PagosPedido from '@/components/ventas/PagosPedido'
import { cn } from '@/lib/utils'

// Conciliación y trazabilidad (#144): ingresos por cuenta, medio y
// procesadora; conciliación en lote de depósitos/transferencias recibidas
// (esperado vs recibido + diferencia) y detalle pago por pago con acceso al
// pedido. La conciliación individual sigue en el detalle del pedido.

const ETIQUETAS = {
  PENDING: { label: 'Por conciliar', color: 'yellow' },
  VERIFIED: { label: 'Conciliado', color: 'green' },
  REJECTED: { label: 'Rechazado', color: 'red' },
}
const medioDe = (method) => PAYMENT_METHOD_LABELS[method] || (method === 'CRYPTO' ? 'USDT - Cripto' : method)

const fecha = (valor) => {
  if (!valor) return '—'
  const date = new Date(valor)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' })
}
const fechaHora = (valor) => {
  if (!valor) return '—'
  const date = new Date(valor)
  return Number.isNaN(date.getTime()) ? '—' : `${date.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' })} · ${date.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}`
}

const rangoPorDefecto = () => ({ ...PRESETS.find((preset) => preset.id === '30d').calc(), preset: '30d' })

const GRID_GRUPOS = 'grid min-w-[46rem] grid-cols-[minmax(0,1.5fr)_5rem_6.5rem_6.5rem_7rem_minmax(0,1fr)] items-center gap-x-2'
const GRID_ITEMS = 'grid min-w-[64rem] grid-cols-[1.5rem_5.5rem_minmax(0,1.3fr)_minmax(0,1.2fr)_7rem_minmax(0,0.9fr)_7rem_6.5rem_5rem] items-center gap-x-2'
const CELDA = 'truncate text-[10px] font-bold uppercase tracking-wider text-mute'

function Resumen({ resumen }) {
  const tarjetas = [
    { label: 'Ingresos conciliables', valor: resumen.confirmedPyg, sub: `${resumen.count} pago(s) · ${gs(resumen.pendingPyg)} pendiente de aprobación`, tono: '' },
    { label: 'Conciliado', valor: resumen.verifiedPyg, sub: `${resumen.verifiedCount} verificado(s)`, tono: 'text-ok' },
    { label: 'Por conciliar', valor: resumen.unverifiedPyg, sub: `${resumen.pendingCount} sin verificar`, tono: resumen.unverifiedPyg > 0 ? 'text-warn' : '' },
    { label: 'Diferencia de lotes', valor: resumen.differencePyg, sub: `${resumen.lotes} lote(s) en el período`, tono: resumen.differencePyg ? 'text-bad' : '' },
  ]
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {tarjetas.map((tarjeta) => (
        <div key={tarjeta.label} className={cn('rounded-xl border border-ink-600 p-3', tarjeta.tono === 'text-warn' && 'border-warn/40 bg-warn/5')}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-mute">{tarjeta.label}</p>
          <strong className={cn('mt-1 block tabular-nums', tarjeta.tono)}>{gs(tarjeta.valor || 0)}</strong>
          <p className="mt-0.5 text-[11px] text-mute">{tarjeta.sub}</p>
        </div>
      ))}
    </div>
  )
}

function Grupos({ titulo, filas, activo, onFiltrar }) {
  const [abierto, setAbierto] = useState(true)
  if (!filas?.length) return null
  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        <button type="button" className="text-xs text-mute transition hover:text-fore" onClick={() => setAbierto((valor) => !valor)}>{abierto ? 'Ocultar' : 'Ver'}</button>
      </div>
      {abierto && <div className="overflow-x-auto">
        <div className={cn(GRID_GRUPOS, 'px-3.5 pb-2 pt-1')}>
          {['Cuenta / procesadora', 'Pagos', 'Conciliado', 'Por conciliar', 'Diferencia', 'Detalle'].map((columna) => <span key={columna} className={CELDA}>{columna}</span>)}
        </div>
        <div className="space-y-1">
          {filas.map((fila) => (
            <button
              key={fila.key}
              type="button"
              onClick={() => onFiltrar(fila)}
              className={cn(GRID_GRUPOS, 'w-full rounded-xl border px-3.5 py-2 text-left transition hover:border-fono/40', activo(fila) ? 'border-fono/50 bg-fono/10' : 'border-ink-600 bg-ink-800/40')}
            >
              <span className="min-w-0">
                <b className="block truncate text-[13px] font-semibold">{fila.label}</b>
                <span className="mt-0.5 block truncate text-[11px] text-mute">{[medioDe(fila.method), fila.processor, fila.secondary].filter(Boolean).join(' · ') || '—'}</span>
              </span>
              <span className="truncate text-xs tabular-nums text-mute">{fila.count}</span>
              <span className="truncate text-xs tabular-nums text-ok">{gs(fila.verifiedPyg)}</span>
              <span className="truncate text-xs tabular-nums text-warn">{gs(fila.unverifiedPyg)}</span>
              <span className={cn('truncate text-xs tabular-nums', fila.differencePyg ? 'text-bad' : 'text-mute')}>{fila.differencePyg ? gs(fila.differencePyg) : '—'}</span>
              <span className="truncate text-[11px] text-mute">{fila.pendingCount} por conciliar · {fila.verifiedCount} listos</span>
            </button>
          ))}
        </div>
      </div>}
    </Card>
  )
}

export default function Conciliacion() {
  const { esDemo } = useSesion()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [rango, setRango] = useState(() => rangoDeParams(searchParams, rangoPorDefecto))
  const cambiarRango = useCallback((next) => {
    setRango(next)
    setSearchParams((actuales) => paramsDeRango(next, actuales), { replace: true })
  }, [setSearchParams])
  const [filtros, setFiltros] = useState({ accountId: '', method: '', processor: '' })
  const [estado, setEstado] = useState('')
  const [vista, setVista] = useState('cuenta')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [seleccion, setSeleccion] = useState([])
  const [recibido, setRecibido] = useState('')
  const [nota, setNota] = useState('')
  const [conciliando, setConciliando] = useState(false)
  const [pedido, setPedido] = useState(null)

  const cargar = useCallback(async () => {
    if (esDemo) return
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ from: rango.desde, to: rango.hasta })
      if (filtros.accountId) params.set('accountId', filtros.accountId)
      if (filtros.method) params.set('method', filtros.method)
      if (filtros.processor) params.set('processor', filtros.processor)
      setData(await api.get(`/api/finance/reconciliation?${params}`))
    } catch (cause) {
      setError(cause?.message || 'No se pudo cargar la conciliación.')
      setData(null)
    } finally { setLoading(false) }
  }, [esDemo, rango.desde, rango.hasta, filtros.accountId, filtros.method, filtros.processor])

  useEffect(() => { cargar() }, [cargar])
  // La selección y el formulario del lote no sobreviven a un cambio de filtro.
  useEffect(() => { setSeleccion([]); setRecibido(''); setNota('') }, [filtros.accountId, filtros.method, filtros.processor, rango.desde, rango.hasta])

  const items = useMemo(() => data?.items || [], [data])
  const lotes = useMemo(() => data?.lotes || [], [data])
  const filtrados = useMemo(() => (estado ? items.filter((item) => item.conciliacion.state === estado) : items), [items, estado])
  const seleccionados = useMemo(() => items.filter((item) => seleccion.includes(item.id)), [items, seleccion])
  const esperado = seleccionados.reduce((total, item) => total + item.montoPyg, 0)
  const diferencia = (Number(recibido) || 0) - esperado
  const pendientes = filtrados.filter((item) => item.conciliacion.state !== 'VERIFIED' && item.status !== 'REFUNDED')
  const saldoCuenta = filtros.accountId || (seleccionados.length && seleccionados.every((item) => (item.accountId || '') === (seleccionados[0].accountId || '')) ? seleccionados[0].accountId : '')
  const procesadoraLote = seleccionados.length && seleccionados.every((item) => item.procesadora === seleccionados[0].procesadora) ? seleccionados[0].procesadora : ''

  function alternar(id) {
    setSeleccion((actual) => {
      const next = actual.includes(id) ? actual.filter((valor) => valor !== id) : [...actual, id]
      const total = items.filter((item) => next.includes(item.id)).reduce((suma, item) => suma + item.montoPyg, 0)
      setRecibido(String(total))
      return next
    })
  }
  function seleccionarPendientes() {
    const ids = pendientes.map((item) => item.id)
    setSeleccion(ids)
    setRecibido(String(pendientes.reduce((suma, item) => suma + item.montoPyg, 0)))
  }
  function filtrarPor(fila) {
    if (vista === 'cuenta') setFiltros({ accountId: fila.key.startsWith('metodo:') ? '' : fila.key, method: fila.key.startsWith('metodo:') ? fila.method : '', processor: '' })
    else if (vista === 'medio') setFiltros({ accountId: '', method: fila.key, processor: '' })
    else setFiltros({ accountId: '', method: '', processor: fila.processor })
  }
  const activo = (fila) => vista === 'cuenta' ? filtros.accountId === fila.key : vista === 'medio' ? filtros.method === fila.key : filtros.processor === fila.processor
  const hayFiltros = Boolean(filtros.accountId || filtros.method || filtros.processor)

  async function conciliar() {
    if (!seleccionados.length || conciliando) return
    setConciliando(true)
    setError('')
    try {
      const resultado = await api.post('/api/finance/reconciliation', {
        action: 'batch',
        paymentIds: seleccionados.map((item) => item.id),
        receivedPyg: Number(recibido) || 0,
        note: nota.trim() || undefined,
        ...(saldoCuenta ? { accountId: saldoCuenta } : {}),
      })
      toast.success(`Lote conciliado: ${resultado.conciliados} pago(s)${resultado.lote.differencePyg ? ` con diferencia de ${gs(resultado.lote.differencePyg)}` : ''}.`)
      setSeleccion([]); setRecibido(''); setNota('')
      await cargar()
    } catch (cause) { setError(cause?.message || 'No se pudo conciliar el lote.') } finally { setConciliando(false) }
  }

  async function verPedido(item) {
    if (!item.orderId) return
    try { setPedido(ventaDesdeApi(await api.get(`/api/orders/${encodeURIComponent(item.orderId)}`))) } catch (cause) { setError(cause?.message || 'No se pudo abrir el pedido.') }
  }

  if (esDemo) {
    return <Card><EmptyState compact icon="wallet" title="Conciliación no está disponible en la demo." description="Con datos reales vas a ver ingresos por cuenta, medio y procesadora, y conciliar los depósitos recibidos." /></Card>
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-bold">Conciliación y trazabilidad</h2>
            <p className="mt-1 text-sm text-mute">Ingresos por cuenta, medio y procesadora. Conciliá en lote el depósito o la transferencia recibida contra los pagos que debería cubrir: esperado vs recibido, diferencia y detalle hasta el pedido.</p>
          </div>
          <RangoFechas valor={rango} onChange={cambiarRango} />
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs text-mute">Cuenta
            <Select className="mt-1" value={filtros.accountId} onChange={(event) => setFiltros((actual) => ({ ...actual, accountId: event.target.value }))}>
              <option value="">Todas</option>
              {(data?.porCuenta || []).filter((fila) => !fila.key.startsWith('metodo:')).map((fila) => <option key={fila.key} value={fila.key}>{fila.label}</option>)}
            </Select>
          </label>
          <label className="text-xs text-mute">Medio
            <Select className="mt-1" value={filtros.method} onChange={(event) => setFiltros((actual) => ({ ...actual, method: event.target.value }))}>
              <option value="">Todos</option>
              {(data?.porMedio || []).map((fila) => <option key={fila.key} value={fila.key}>{medioDe(fila.key)}</option>)}
            </Select>
          </label>
          <label className="text-xs text-mute">Procesadora
            <Select className="mt-1" value={filtros.processor} onChange={(event) => setFiltros((actual) => ({ ...actual, processor: event.target.value }))}>
              <option value="">Todas</option>
              {(data?.porProcesadora || []).map((fila) => <option key={fila.key} value={fila.key}>{fila.label}</option>)}
            </Select>
          </label>
        </div>
        <Resumen resumen={data?.resumen || {}} />
        {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {[['cuenta', 'Por cuenta'], ['medio', 'Por medio'], ['procesadora', 'Por procesadora']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setVista(id)} className={cn('rounded-lg border px-3 py-1.5 text-xs font-semibold transition', vista === id ? 'border-fono/50 bg-fono/15 text-fono-light' : 'border-ink-600 text-mute hover:text-fore')}>{label}</button>
        ))}
        {hayFiltros && <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setFiltros({ accountId: '', method: '', processor: '' })}>Limpiar filtros</Button>}
        {data?.truncado && <Badge color="orange">Mostrando los primeros 1.000 pagos</Badge>}
      </div>

      <Grupos titulo={vista === 'cuenta' ? 'Cuentas del período' : vista === 'medio' ? 'Medios del período' : 'Procesadoras del período'} filas={data?.[vista === 'cuenta' ? 'porCuenta' : vista === 'medio' ? 'porMedio' : 'porProcesadora'] || []} activo={activo} onFiltrar={filtrarPor} />

      {seleccionados.length > 0 && (
        <Card className="space-y-3 border-fono/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{seleccionados.length} pago(s) · esperado {gs(esperado)}</p>
              <p className="text-xs text-mute">{[saldoCuenta ? (seleccionados[0].cuenta || 'Cuenta') : 'Sin cuenta', procesadoraLote].filter(Boolean).join(' · ')}</p>
            </div>
            <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={() => { setSeleccion([]); setRecibido(''); setNota('') }}>Quitar selección</Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs text-mute">Monto recibido
              <MoneyInput className="mt-1" value={recibido} onValueChange={setRecibido} />
            </label>
            <label className="text-xs text-mute">Diferencia
              <p className={cn('mt-1 flex h-9 items-center rounded-lg border px-3 text-sm font-semibold tabular-nums', diferencia === 0 ? 'border-ink-600 text-mute' : 'border-bad/40 bg-bad/10 text-bad')}>{diferencia > 0 ? '+' : ''}{gs(diferencia)}</p>
            </label>
            <label className="text-xs text-mute">Observación {diferencia !== 0 && <b className="text-warn">(obligatoria con diferencia)</b>}
              <Input className="mt-1" maxLength={2000} value={nota} onChange={(event) => setNota(event.target.value)} placeholder="Ej. la procesadora retuvo la comisión del lote" />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-mute">Al conciliar, los pagos quedan verificados (y las cuotas pendientes se confirman) con tu usuario real en la auditoría.</p>
            <Button type="button" disabled={conciliando || (diferencia !== 0 && !nota.trim())} onClick={conciliar}>{conciliando ? 'Conciliando…' : 'Conciliar lote'}</Button>
          </div>
        </Card>
      )}

      <Card className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Pagos del período</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Select className="h-8 w-44 text-xs" value={estado} onChange={(event) => setEstado(event.target.value)}>
              <option value="">Todos los estados</option>
              <option value="PENDING">Por conciliar</option>
              <option value="VERIFIED">Conciliados</option>
              <option value="REJECTED">Rechazados</option>
            </Select>
            <Button type="button" variant="outline" className="h-8 px-2 text-xs" disabled={!pendientes.length} onClick={seleccionarPendientes}>Seleccionar por conciliar</Button>
          </div>
        </div>
        {loading && <div className="space-y-2" role="status">{[0, 1, 2].map((fila) => <Skeleton key={fila} className="h-10" />)}</div>}
        {!loading && !filtrados.length && <p className="rounded-lg border border-dashed border-ink-600 px-3 py-6 text-center text-sm text-mute">Sin pagos para los filtros elegidos en el período.</p>}
        {!loading && filtrados.length > 0 && <div className="overflow-x-auto">
          <div className={cn(GRID_ITEMS, 'px-3.5 pb-2 pt-1')}>
            <span />
            {['Fecha', 'Pedido / cliente', 'Cuenta / titular', 'Procesadora', 'Referencia', 'Monto', 'Estado', 'Acciones'].map((columna) => <span key={columna} className={CELDA}>{columna}</span>)}
          </div>
          <div className="space-y-1">
            {filtrados.map((item) => {
              const meta = ETIQUETAS[item.conciliacion.state] || ETIQUETAS.PENDING
              const seleccionable = item.status !== 'REFUNDED' && item.conciliacion.state !== 'VERIFIED'
              const marcado = seleccion.includes(item.id)
              return (
                <div key={item.id} data-testid="conciliacion-fila" className={cn(GRID_ITEMS, 'rounded-xl border px-3.5 py-2', marcado ? 'border-fono/50 bg-fono/10' : 'border-ink-600 bg-ink-800/40')}>
                  <input type="checkbox" className="h-4 w-4 accent-fono" checked={marcado} disabled={!seleccionable} aria-label={`Conciliar pago ${item.orderNumber || item.id}`} onChange={() => alternar(item.id)} />
                  <span className="truncate text-xs text-mute" title={fechaHora(item.fecha)}>{fecha(item.fecha)}</span>
                  <span className="min-w-0">
                    <b className="block truncate text-[13px]">{item.orderNumber || 'Cobro directo'}</b>
                    <span className="mt-0.5 block truncate text-[11px] text-mute">{[item.cliente, item.vendedor].filter(Boolean).join(' · ') || '—'}</span>
                  </span>
                  <span className="min-w-0">
                    <b className="block truncate text-[12px] font-medium">{item.cuenta}</b>
                    <span className="mt-0.5 block truncate text-[11px] text-mute">{[item.titular, item.banco].filter(Boolean).join(' · ') || medioDe(item.method)}</span>
                  </span>
                  <span className="truncate text-xs text-mute">{item.procesadora || '—'}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs text-mute" title={item.reference}>{item.reference || '—'}</span>
                    {item.currency && item.currency !== 'PYG' && <span className="mt-0.5 block truncate text-[11px] text-mute">{formatMoney(item.originalAmount, item.currency)}</span>}
                    {item.settlesAt && <span className="mt-0.5 block truncate text-[11px] text-mute">acredita {fecha(item.settlesAt)}</span>}
                  </span>
                  <span className="truncate text-xs font-semibold tabular-nums">{gs(item.montoPyg)}</span>
                  <span className="flex flex-wrap items-center gap-1">
                    <Badge color={meta.color} className="w-fit whitespace-nowrap">{meta.label}</Badge>
                    {item.conciliacion.batchId && <span className="truncate text-[10px] text-mute" title={`Lote ${item.conciliacion.batchId}`}>lote</span>}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Button type="button" variant="outline" className="h-8 px-2 text-xs" disabled={!item.orderId} onClick={() => verPedido(item)}>Ver pedido</Button>
                  </span>
                </div>
              )
            })}
          </div>
        </div>}
      </Card>

      <Card className="space-y-2">
        <h3 className="text-sm font-semibold">Lotes conciliados</h3>
        {!lotes.length && <p className="text-sm text-mute">Todavía no hay lotes en el período. Seleccioná los pagos de un depósito y concilialos juntos.</p>}
        {lotes.map((lote) => (
          <div key={lote.id} data-testid="conciliacion-lote" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2.5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-[13px]">{lote.cuenta}</b>
                {lote.procesadora && <span className="text-[11px] text-mute">{lote.procesadora}</span>}
                <Badge color={lote.estado === 'REJECTED' ? 'red' : lote.estado === 'DIFFERENCE' ? 'orange' : 'green'}>{lote.estado === 'REJECTED' ? 'Rechazado' : lote.estado === 'DIFFERENCE' ? 'Con diferencia' : 'Conciliado'}</Badge>
              </div>
              <p className="mt-0.5 text-[11px] text-mute">{fechaHora(lote.createdAt)} · {lote.pagos} pago(s) · {lote.creadoPor ? `por ${lote.creadoPor}` : ''}{lote.note ? ` · ${lote.note}` : ''}</p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-right text-xs tabular-nums">
              <span className="text-mute">Esperado <b className="block text-fore">{gs(lote.expectedPyg)}</b></span>
              <span className="text-mute">Recibido <b className="block text-fore">{gs(lote.receivedPyg)}</b></span>
              <span className={cn('text-mute', lote.differencePyg ? 'text-bad' : '')}>Diferencia <b className="block">{lote.differencePyg ? gs(lote.differencePyg) : '—'}</b></span>
            </div>
          </div>
        ))}
      </Card>

      {pedido && <PagosPedido venta={pedido} onClose={() => setPedido(null)} />}
    </div>
  )
}
