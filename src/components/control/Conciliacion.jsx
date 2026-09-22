import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { ventaDesdeApi, listVentas } from '@/lib/storage'
import { getPaymentAccounts } from '@/lib/paymentAccounts'
import { construirDemoConciliacion, conciliarDemoLote } from '@/lib/demoConciliacion'
import { gs } from '@/utils/calculos'
import { formatMoney } from '@/utils/moneda'
import { PAYMENT_METHOD_LABELS } from '@/lib/constants'
import { fechaCorta } from '@/utils/fecha'
import RangoFechas, { PRESETS, rangoDeParams, paramsDeRango } from '@/components/shared/RangoFechas'
import { Aviso, Badge, Button, Card, EmptyState, Input, MoneyInput, Select, Skeleton, useToast } from '@/components/ui'
import PagosPedido from '@/components/ventas/PagosPedido'
import { leerUltimo, recordarUltimo } from '@/lib/ultimoUsado'
import { useUltimoUsado } from '@/hooks/useUltimoUsado'
import { CLAVES_FIN, filtrosConciliacionValidos, rangoDePreset } from '@/lib/finUltimoUsado'
import { cn } from '@/lib/utils'
import { CELDA_DATO, CELDA_ENCABEZADO, CELDA_IDENTIDAD, ROTULO_DATO } from '@/components/shared/tabla'
import { GRILLA_DOS_COLUMNAS_COMPACTA } from '@/components/shared/formulario'
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
const rangoPorDefecto = () => ({ ...PRESETS.find((preset) => preset.id === '30d').calc(), preset: '30d' })

const GRID_GRUPOS = 'grid min-w-[46rem] grid-cols-[minmax(0,1.5fr)_5rem_6.5rem_6.5rem_7rem_minmax(0,1fr)] items-center gap-x-2'
// 60rem entra sin scroll a 1280 (viewport de desktop mínimo) y por debajo
// scrollea dentro de su caja; columnas fijas medidas sobre el dato real.
const GRID_ITEMS = 'grid min-w-[60rem] grid-cols-[1.5rem_5.5rem_minmax(0,1.3fr)_minmax(0,1.2fr)_7rem_minmax(0,0.9fr)_7rem_6.5rem_5rem] items-center gap-x-2'

function Resumen({ resumen }) {
  const tarjetas = [
    { label: 'Ingresos conciliables', valor: resumen.confirmedPyg, sub: `${resumen.count} pago(s) · ${gs(resumen.pendingPyg)} por conciliar`, tono: '' },
    { label: 'Conciliado', valor: resumen.verifiedPyg, sub: `${resumen.verifiedCount} pago(s) conciliado(s)`, tono: 'text-ok' },
    { label: 'Por conciliar', valor: resumen.unverifiedPyg, sub: `${resumen.pendingCount} pago(s) por conciliar`, tono: resumen.unverifiedPyg > 0 ? 'text-warn' : '' },
    { label: 'Diferencia de lotes', valor: resumen.differencePyg, sub: `${resumen.lotes} lote(s) en el período`, tono: resumen.differencePyg ? 'text-bad' : '' },
  ]
  return (
    <div className={cn('lg:grid-cols-4', GRILLA_DOS_COLUMNAS_COMPACTA)}>
      {tarjetas.map((tarjeta) => (
        <div key={tarjeta.label} className={cn('rounded-xl border border-ink-600 p-3', tarjeta.tono === 'text-warn' && 'border-warn/40 bg-warn/5')}>
          <p className={ROTULO_DATO}>{tarjeta.label}</p>
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
        <button type="button" aria-expanded={abierto} className="text-xs text-mute transition hover:text-fore" onClick={() => setAbierto((valor) => !valor)}>{abierto ? 'Ocultar' : 'Mostrar'}</button>
      </div>
      {abierto && <div className="overflow-x-auto" data-testid="conciliacion-grupos">
        <div className={cn(GRID_GRUPOS, 'px-3.5 pb-2 pt-1')}>
          {['Cuenta / procesadora', 'Pagos', 'Conciliado', 'Por conciliar', 'Diferencia', 'Detalle'].map((columna) => <span key={columna} className={CELDA_ENCABEZADO}>{columna}</span>)}
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
                <b className={cn('block', CELDA_IDENTIDAD)}>{fila.label}</b>
                <span className="mt-0.5 block truncate text-[11px] text-mute">{[medioDe(fila.method), fila.processor, fila.secondary].filter(Boolean).join(' · ') || '—'}</span>
              </span>
              <span className="truncate text-xs tabular-nums text-mute">{fila.count}</span>
              <span className="truncate text-xs tabular-nums text-ok">{gs(fila.verifiedPyg)}</span>
              <span className="truncate text-xs tabular-nums text-warn">{gs(fila.unverifiedPyg)}</span>
              <span className={cn('truncate text-xs tabular-nums', fila.differencePyg ? 'text-bad' : 'text-mute')}>{fila.differencePyg ? gs(fila.differencePyg) : '—'}</span>
              <span className="truncate text-[11px] text-mute">{fila.pendingCount} por conciliar · {fila.verifiedCount} conciliados</span>
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
  // #209: el período arranca con el último preset usado en Finanzas/Análisis.
  const [presetRecordado, recordarPreset] = useUltimoUsado(CLAVES_FIN.rango, '30d')
  const [rango, setRango] = useState(() => rangoDeParams(searchParams, () => rangoDePreset(PRESETS, presetRecordado, rangoPorDefecto)))
  const cambiarRango = useCallback((next) => {
    setRango(next)
    if (next?.preset) recordarPreset(next.preset)
    setSearchParams((actuales) => paramsDeRango(next, actuales), { replace: true })
  }, [setSearchParams, recordarPreset])
  // #209: filtros y estado arrancan con lo último usado; se validan contra las
  // facetas del período apenas llega la primera carga.
  const [filtros, setFiltros] = useState(() => ({
    accountId: leerUltimo(CLAVES_FIN.conciliacionCuenta),
    method: leerUltimo(CLAVES_FIN.conciliacionMedio),
    processor: leerUltimo(CLAVES_FIN.conciliacionProcesadora),
  }))
  const [estado, setEstado] = useState(() => leerUltimo(CLAVES_FIN.conciliacionEstado))
  const [recordados, setRecordados] = useState(() => Boolean(leerUltimo(CLAVES_FIN.conciliacionCuenta) || leerUltimo(CLAVES_FIN.conciliacionMedio) || leerUltimo(CLAVES_FIN.conciliacionProcesadora) || leerUltimo(CLAVES_FIN.conciliacionEstado)))
  const [filtrosValidados, setFiltrosValidados] = useState(false)
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
    setLoading(true)
    setError('')
    try {
      // En la demo la conciliación se arma con datos ficticios locales (#194):
      // mismos grupos, items y lotes, sin consultar la API real.
      if (esDemo) {
        const [cuentas, ventas] = await Promise.all([getPaymentAccounts(), Promise.resolve(listVentas())])
        setData(construirDemoConciliacion({ ventas, cuentas, desde: rango.desde, hasta: rango.hasta, ...filtros }))
        return
      }
      const params = new URLSearchParams({ from: rango.desde, to: rango.hasta })
      if (filtros.accountId) params.set('accountId', filtros.accountId)
      if (filtros.method) params.set('method', filtros.method)
      if (filtros.processor) params.set('processor', filtros.processor)
      setData(await api.get(`/api/finance/reconciliation?${params}`))
    } catch (cause) {
      setError(cause?.message || 'No se pudo cargar la conciliación.')
      setData(null)
    } finally { setLoading(false) }
  }, [esDemo, rango.desde, rango.hasta, filtros])

  useEffect(() => { cargar() }, [cargar])
  // La selección y el formulario del lote no sobreviven a un cambio de filtro.
  useEffect(() => { setSeleccion([]); setRecibido(''); setNota('') }, [filtros.accountId, filtros.method, filtros.processor, rango.desde, rango.hasta])
  // #209: si un filtro recordado ya no existe en el período, se suelta y se
  // olvida para no arrastrarlo; el default de la pantalla es «todas».
  useEffect(() => {
    if (!data || filtrosValidados) return
    setFiltrosValidados(true)
    const { filtros: limpios, estado: estadoLimpio } = filtrosConciliacionValidos(filtros, estado, data)
    if (limpios.accountId !== filtros.accountId || limpios.method !== filtros.method || limpios.processor !== filtros.processor) {
      setFiltros(limpios)
      if (!limpios.accountId) recordarUltimo(CLAVES_FIN.conciliacionCuenta, '')
      if (!limpios.method) recordarUltimo(CLAVES_FIN.conciliacionMedio, '')
      if (!limpios.processor) recordarUltimo(CLAVES_FIN.conciliacionProcesadora, '')
    }
    if (estadoLimpio !== estado) {
      setEstado(estadoLimpio)
      if (!estadoLimpio) recordarUltimo(CLAVES_FIN.conciliacionEstado, '')
    }
  }, [data, filtrosValidados, filtros, estado])

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
    if (vista === 'cuenta' && !fila.key.startsWith('metodo:')) {
      setFiltros({ accountId: fila.key, method: '', processor: '' })
      recordarUltimo(CLAVES_FIN.conciliacionCuenta, fila.key)
    } else if (vista === 'cuenta' || vista === 'medio') {
      const metodo = vista === 'medio' ? fila.key : fila.method
      setFiltros({ accountId: '', method: metodo, processor: '' })
      recordarUltimo(CLAVES_FIN.conciliacionMedio, metodo)
    } else {
      setFiltros({ accountId: '', method: '', processor: fila.processor })
      recordarUltimo(CLAVES_FIN.conciliacionProcesadora, fila.processor)
    }
    setRecordados(false)
  }
  // #209: cada cambio explícito se recuerda y deja de mostrarse como «recordado».
  function cambiarFiltro(campo, valor) {
    setFiltros((actual) => ({ ...actual, [campo]: valor }))
    setRecordados(false)
    recordarUltimo(campo === 'accountId' ? CLAVES_FIN.conciliacionCuenta : campo === 'method' ? CLAVES_FIN.conciliacionMedio : CLAVES_FIN.conciliacionProcesadora, valor)
  }
  function cambiarEstado(valor) {
    setEstado(valor)
    setRecordados(false)
    recordarUltimo(CLAVES_FIN.conciliacionEstado, valor)
  }
  function limpiarFiltros() {
    setFiltros({ accountId: '', method: '', processor: '' })
    setEstado('')
    setRecordados(false)
    recordarUltimo(CLAVES_FIN.conciliacionCuenta, '')
    recordarUltimo(CLAVES_FIN.conciliacionMedio, '')
    recordarUltimo(CLAVES_FIN.conciliacionProcesadora, '')
    recordarUltimo(CLAVES_FIN.conciliacionEstado, '')
  }
  const activo = (fila) => vista === 'cuenta' ? filtros.accountId === fila.key : vista === 'medio' ? filtros.method === fila.key : filtros.processor === fila.processor
  const hayFiltros = Boolean(filtros.accountId || filtros.method || filtros.processor)
  const hayRecorte = hayFiltros || Boolean(estado)

  async function conciliar() {
    if (!seleccionados.length || conciliando) return
    setConciliando(true)
    setError('')
    try {
      if (esDemo) {
        const lote = conciliarDemoLote({ items: seleccionados, receivedPyg: Number(recibido) || 0, note: nota.trim() })
        toast.success(`Lote conciliado (demo): ${lote.pagos} pago(s)${lote.differencePyg ? ` con diferencia de ${gs(lote.differencePyg)}` : ''}.`)
        setSeleccion([]); setRecibido(''); setNota('')
        await cargar()
        return
      }
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
    try {
      // En demo el pedido es una venta ficticia local: no se consulta la API.
      if (esDemo) {
        const venta = listVentas().find((fila) => fila.id === item.orderId)
        if (venta) setPedido(venta)
        return
      }
      setPedido(ventaDesdeApi(await api.get(`/api/orders/${encodeURIComponent(item.orderId)}`)))
    } catch (cause) { setError(cause?.message || 'No se pudo abrir el pedido.') }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-bold">Conciliación y trazabilidad</h2>
            <p className="mt-1 text-sm text-mute">Ingresos por cuenta, medio y procesadora. Conciliá en lote el depósito o la transferencia recibida contra los pagos que debería cubrir: esperado vs recibido, diferencia y detalle hasta el pedido.</p>
            {esDemo && <p className="mt-1 text-xs text-fono-light">Demo: cobros y cuentas ficticios; los lotes conciliados se guardan en este navegador.</p>}
          </div>
          <RangoFechas valor={rango} onChange={cambiarRango} />
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs text-mute">Cuenta
            <Select className="mt-1" title="Se recuerda tu último filtro" value={filtros.accountId} onChange={(event) => cambiarFiltro('accountId', event.target.value)}>
              <option value="">Todas</option>
              {(data?.porCuenta || []).filter((fila) => !fila.key.startsWith('metodo:')).map((fila) => <option key={fila.key} value={fila.key}>{fila.label}</option>)}
            </Select>
          </label>
          <label className="text-xs text-mute">Medio
            <Select className="mt-1" title="Se recuerda tu último filtro" value={filtros.method} onChange={(event) => cambiarFiltro('method', event.target.value)}>
              <option value="">Todos</option>
              {(data?.porMedio || []).map((fila) => <option key={fila.key} value={fila.key}>{medioDe(fila.key)}</option>)}
            </Select>
          </label>
          <label className="text-xs text-mute">Procesadora
            <Select className="mt-1" title="Se recuerda tu último filtro" value={filtros.processor} onChange={(event) => cambiarFiltro('processor', event.target.value)}>
              <option value="">Todas</option>
              {(data?.porProcesadora || []).map((fila) => <option key={fila.key} value={fila.key}>{fila.label}</option>)}
            </Select>
          </label>
        </div>
        <Resumen resumen={data?.resumen || {}} />
        {error && <Aviso tono="error">{error}</Aviso>}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {[['cuenta', 'Por cuenta'], ['medio', 'Por medio'], ['procesadora', 'Por procesadora']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setVista(id)} className={cn('rounded-lg border px-3 py-1.5 text-xs font-semibold transition', vista === id ? 'border-fono/50 bg-fono/15 text-fono-light' : 'border-ink-600 text-mute hover:text-fore')}>{label}</button>
        ))}
        {recordados && hayRecorte && <span className="text-[11px] text-mute">Filtros de tu última visita</span>}
        {hayFiltros && <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={limpiarFiltros}>Limpiar filtros</Button>}
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
            <p className="text-[11px] text-mute">Al conciliar, los pagos quedan verificados (y las cuotas pendientes se confirman) y la marca queda registrada en la auditoría con tu usuario.</p>
            <Button type="button" disabled={conciliando || (diferencia !== 0 && !nota.trim())} onClick={conciliar}>{conciliando ? 'Conciliando…' : 'Conciliar lote'}</Button>
          </div>
        </Card>
      )}

      <Card className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Pagos del período</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Select className="h-8 w-44 text-xs" aria-label="Estado" title="Se recuerda tu último filtro" value={estado} onChange={(event) => cambiarEstado(event.target.value)}>
              <option value="">Todos los estados</option>
              <option value="PENDING">Por conciliar</option>
              <option value="VERIFIED">Conciliados</option>
              <option value="REJECTED">Rechazados</option>
            </Select>
            <Button type="button" variant="outline" className="h-8 px-2 text-xs" disabled={!pendientes.length} onClick={seleccionarPendientes}>Seleccionar por conciliar</Button>
          </div>
        </div>
        {loading && <div className="space-y-2" role="status">{[0, 1, 2].map((fila) => <Skeleton key={fila} className="h-10" />)}</div>}
        {!loading && !filtrados.length && (
          <EmptyState
            compact
            icon="box"
            title="Sin pagos para estos filtros"
            description={hayRecorte ? 'Probá ampliar el período o limpiar los filtros.' : 'En el período elegido no hubo pagos conciliables.'}
            action={hayRecorte ? <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={limpiarFiltros}>Limpiar filtros</Button> : null}
          />
        )}
        {!loading && filtrados.length > 0 && <div className="overflow-x-auto" data-testid="conciliacion-tabla">
          <div className={cn(GRID_ITEMS, 'px-3.5 pb-2 pt-1')}>
            <span />
            {['Fecha', 'Pedido / cliente', 'Cuenta / titular', 'Procesadora', 'Referencia', 'Monto', 'Estado', 'Acciones'].map((columna) => <span key={columna} className={CELDA_ENCABEZADO}>{columna}</span>)}
          </div>
          <div className="space-y-1">
            {filtrados.map((item) => {
              const meta = ETIQUETAS[item.conciliacion.state] || ETIQUETAS.PENDING
              const seleccionable = item.status !== 'REFUNDED' && item.conciliacion.state !== 'VERIFIED'
              const marcado = seleccion.includes(item.id)
              return (
                <div key={item.id} data-testid="conciliacion-fila" className={cn(GRID_ITEMS, 'rounded-xl border px-3.5 py-2', marcado ? 'border-fono/50 bg-fono/10' : 'border-ink-600 bg-ink-800/40')}>
                  <input type="checkbox" className="h-4 w-4 accent-fono" checked={marcado} disabled={!seleccionable} aria-label={`Conciliar pago ${item.orderNumber || item.id}`} onChange={() => alternar(item.id)} />
                  <span className={CELDA_DATO} title={fechaCorta(item.fecha)}>{fecha(item.fecha)}</span>
                  <span className="min-w-0">
                    <b className="block truncate text-[13px]">{item.orderNumber || 'Cobro directo'}</b>
                    <span className="mt-0.5 block truncate text-[11px] text-mute">{[item.cliente, item.vendedor].filter(Boolean).join(' · ') || '—'}</span>
                  </span>
                  <span className="min-w-0">
                    <b className="block truncate text-[12px] font-medium">{item.cuenta}</b>
                    <span className="mt-0.5 block truncate text-[11px] text-mute">{[item.titular, item.banco].filter(Boolean).join(' · ') || medioDe(item.method)}</span>
                  </span>
                  <span className={CELDA_DATO}>{item.procesadora || '—'}</span>
                  <span className="min-w-0">
                    <span className={cn('block', CELDA_DATO)} title={item.reference}>{item.reference || '—'}</span>
                    {item.currency && item.currency !== 'PYG' && <span className="mt-0.5 block truncate text-[11px] text-mute">{formatMoney(item.originalAmount, item.currency)}</span>}
                    {item.settlesAt && <span className="mt-0.5 block truncate text-[11px] text-mute">acredita {fecha(item.settlesAt)}</span>}
                  </span>
                  <span className="truncate text-xs font-semibold tabular-nums">{gs(item.montoPyg)}</span>
                  <span className="flex flex-wrap items-center gap-1">
                    <Badge color={meta.color} className="w-fit whitespace-nowrap">{meta.label}</Badge>
                    {item.conciliacion.batchId && <span className="truncate text-[10px] text-mute" title="Forma parte de un lote conciliado">lote</span>}
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
        {!lotes.length && <EmptyState compact icon="receipt" title="Todavía no hay lotes en el período" description="Seleccioná los pagos de un depósito y concilialos juntos: el lote aparece acá con su diferencia." />}
        {lotes.map((lote) => (
          <div key={lote.id} data-testid="conciliacion-lote" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2.5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-[13px]">{lote.cuenta}</b>
                {lote.procesadora && <span className="text-[11px] text-mute">{lote.procesadora}</span>}
                <Badge color={lote.estado === 'REJECTED' ? 'red' : lote.estado === 'DIFFERENCE' ? 'orange' : 'green'}>{lote.estado === 'REJECTED' ? 'Rechazado' : lote.estado === 'DIFFERENCE' ? 'Con diferencia' : 'Conciliado'}</Badge>
              </div>
              <p className="mt-0.5 text-[11px] text-mute">{fechaCorta(lote.createdAt)} · {lote.pagos} pago(s) · {lote.creadoPor ? `por ${lote.creadoPor}` : ''}{lote.note ? ` · ${lote.note}` : ''}</p>
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
