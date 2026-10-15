import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { Aviso, Badge, Button, ConfirmDialog, FormField, Input, Modal, Money, MoneyInput, Select, Textarea, useToast } from '@/components/ui'
import { Campo, GrillaCampos } from '@/components/shared/GrillaCampos'
import { codigoPedido } from '@/utils/pedido'
import { ChipsReparto } from './ChipsReparto'

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
function previousMonday() {
  const day = new Date(`${today()}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7) - 7)
  return day.toISOString().slice(0, 10)
}
const dateText = value => String(value || '').slice(0, 10)
const branchName = branch => branch.nombre || branch.name || 'Sucursal'
const formClass = 'space-y-4'

export default function DeliveryOperations() {
  const { esDemo, empresa, usuario, sucursales = [], sucursal } = useSesion()
  const toast = useToast()
  const [tab, setTab] = useState('viajes'), [rows, setRows] = useState([]), [tariffs, setTariffs] = useState([]), [team, setTeam] = useState([]), [orders, setOrders] = useState([])
  const [owner, setOwner] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [trip, setTrip] = useState(null), [tariff, setTariff] = useState(null), [resolution, setResolution] = useState(null), [deactivate, setDeactivate] = useState(null), [adjustment, setAdjustment] = useState(null), [confirmClose, setConfirmClose] = useState(false)
  const [query, setQuery] = useState({ branchId: sucursal?.id || '', driverId: '', weekStart: previousMonday() }), [weekly, setWeekly] = useState(null)
  const [unresolved, setUnresolved] = useState(false)
  const weeklyRequest = useRef(null)
  const loadRequest = useRef(null)
  const scopeKey = JSON.stringify([empresa?.id, usuario?.id, sucursal?.id, esDemo, unresolved])
  const scope = useRef({ key: scopeKey, epoch: 0, mounted: false, loadId: 0, mutationId: 0, mutating: false })
  // Invalidar en el commit, antes de pintar el contexto nuevo. No alcanza con
  // abortar el efecto inicial: Actualizar y las mutaciones también tienen tareas pendientes.
  useLayoutEffect(() => {
    const epoch = ++scope.current.epoch
    scope.current.key = scopeKey; scope.current.mounted = true; scope.current.mutating = false
    setRows([]); setTariffs([]); setTeam([]); setOrders([]); setOwner(false); setWeekly(null)
    setLoading(false); setBusy(false); setError(''); setTab('viajes')
    setTrip(null); setTariff(null); setResolution(null); setDeactivate(null); setAdjustment(null); setConfirmClose(false)
    setQuery({ branchId: sucursal?.id || '', driverId: '', weekStart: previousMonday() })
    return () => {
      if (scope.current.epoch === epoch) {
        scope.current.mounted = false; scope.current.epoch++; scope.current.mutating = false
        loadRequest.current?.abort(); weeklyRequest.current?.abort()
      }
    }
  }, [scopeKey, sucursal?.id])
  const load = useCallback(async () => {
    if (esDemo || !scope.current.mounted || scope.current.key !== scopeKey) return
    loadRequest.current?.abort()
    const controller = new AbortController(), { signal } = controller
    loadRequest.current = controller
    const epoch = scope.current.epoch, loadId = ++scope.current.loadId
    const current = () => scope.current.mounted && scope.current.key === scopeKey && scope.current.epoch === epoch && scope.current.loadId === loadId && !signal.aborted
    setLoading(true); setError('')
    try {
      const [trips, rates, drivers, pedidos] = await Promise.all([
        api.get(`/api/delivery/trips${unresolved ? '?unresolved=true' : ''}`, { cacheMs: 0, signal }), api.get('/api/delivery/tariffs', { cacheMs: 0, signal }),
        api.get('/api/delivery/team', { cacheMs: 0, signal }), api.get('/api/delivery/orders?estado=todos&limit=500', { cacheMs: 0, signal }),
      ])
      if (!current()) return
      setRows(trips.rows); setOwner(trips.owner); setTariffs(rates.rows); setTeam(drivers); setOrders(pedidos)
    } catch (cause) {
      if (!signal.aborted) console.error('[delivery-operations]', cause)
      if (current()) setError(cause.message || 'No se pudieron cargar los viajes.')
    } finally { if (current()) setLoading(false) }
  }, [esDemo, unresolved, scopeKey])
  useEffect(() => { load() }, [load])

  async function run(action, message, finish) {
    if (scope.current.mutating || !scope.current.mounted || scope.current.key !== scopeKey) return
    scope.current.mutating = true
    const epoch = scope.current.epoch, mutationId = ++scope.current.mutationId
    const current = () => scope.current.mounted && scope.current.key === scopeKey && scope.current.epoch === epoch && scope.current.mutationId === mutationId
    setBusy(true); setError('')
    try {
      await action()
      if (!current()) return
      finish?.()
      if (!current()) return
      toast.success(message)
      await load()
    } catch (cause) {
      console.error('[delivery-operations]', cause)
      if (current()) { setError(cause.message || 'No se pudo guardar.'); toast.error('No se pudo guardar', cause.message) }
    } finally { if (current()) { scope.current.mutating = false; setBusy(false) } }
  }
  async function loadWeek() {
    if (!scope.current.mounted || scope.current.key !== scopeKey) return
    if (!query.branchId || !query.driverId || !query.weekStart) { setError('Elegí sucursal, repartidor y lunes de la semana.'); return }
    weeklyRequest.current?.abort()
    const controller = new AbortController(), epoch = scope.current.epoch
    weeklyRequest.current = controller
    const current = () => scope.current.mounted && scope.current.key === scopeKey && scope.current.epoch === epoch && weeklyRequest.current === controller && !controller.signal.aborted
    setLoading(true); setError(''); setWeekly(null)
    try {
      const result = await api.get(`/api/delivery/weekly?${new URLSearchParams(query)}`, { cacheMs: 0, signal: controller.signal })
      if (current()) setWeekly(result)
    } catch (cause) {
      if (!controller.signal.aborted) console.error('[delivery-weekly]', cause)
      if (current()) setError(cause.message)
    } finally { if (current()) setLoading(false) }
  }
  const changeQuery = (key, value) => { weeklyRequest.current?.abort(); setLoading(false); setQuery(current => ({ ...current, [key]: value })); setWeekly(null) }
  const initialBranch = sucursal?.id || sucursales[0]?.id || ''
  const driversFor = branchId => team.filter(person => !person.branchId || person.branchId === branchId)
  const ordersFor = branchId => orders.filter(order => order.branchId === branchId && order.status !== 'CANCELLED')
  const orderOptions = branchId => ordersFor(branchId).map(order => <option key={order.id} value={order.id}>{codigoPedido(order.orderNumber)} · {order.customer?.name || 'Cliente'}</option>)
  const branchOptions = sucursales.map(branch => <option key={branch.id} value={branch.id}>{branchName(branch)}</option>)
  const close = weekly?.close
  const balance = close?.current || weekly?.amounts
  const activeTariff = trip && tariffs.find(rate => rate.isActive && dateText(rate.validFrom) <= trip.performedOn && dateText(rate.validUntil) >= trip.performedOn)
  const tier = activeTariff?.tiers.find(row => Number(trip.distanceKm) > 0 && Number(trip.distanceKm) <= row.upToKm)

  if (esDemo) return <Aviso>Los viajes, honorarios y cierres semanales se configuran en una empresa real. La demo no activa tarifas ni registra ventas.</Aviso>
  return <section className="space-y-4" aria-label="Viajes y cierres semanales">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <ChipsReparto flat value={tab} onChange={value => { setTab(value); setError('') }} items={owner ? [['viajes', 'Viajes'], ['tarifas', 'Tarifas'], ['cierres', 'Cierre semanal']] : [['viajes', 'Viajes']]} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => load()} disabled={loading || busy}>Actualizar</Button>
        {tab === 'viajes' && <Button disabled={busy || loading} onClick={() => setTrip({ branchId: initialBranch, driverId: '', orderId: '', route: '', performedOn: today(), distanceKm: '', tripsCount: 1, idempotencyKey: crypto.randomUUID() })}>Registrar viajes</Button>}
        {tab === 'tarifas' && owner && <Button onClick={() => setTariff({ name: '', validFrom: today(), validUntil: '', tiers: [{ upToKm: 28, feePyg: '' }] })}>Nueva tarifa</Button>}
      </div>
    </div>
    {error && <Aviso tono="error">{error}</Aviso>}
    {loading && <p role="status" className="text-sm text-mute">Cargando reparto…</p>}
    {tab === 'viajes' && <>
      <p className="text-sm text-mute">Registrá los viajes realizados. Los honorarios del repartidor se calculan aparte del envío que paga el cliente. Avisar al grupo no crea una venta.</p>
      {!tariffs.some(rate => rate.isActive && dateText(rate.validFrom) <= today() && dateText(rate.validUntil) >= today()) && <Aviso>No hay tarifa activa hoy. El dueño debe guardar una tarifa con sus precios y vigencia.</Aviso>}
      {owner && <ChipsReparto flat value={unresolved ? 'unresolved' : 'all'} onChange={value => setUnresolved(value === 'unresolved')} items={[[ 'all', 'Todos los viajes' ], ['unresolved', 'Sin venta']]} />}
      <div className="space-y-2">
        {rows.filter(row => !unresolved || (!row.orderId && row.status === 'COMPLETED')).map(row => <article key={row.id} className="rounded-xl border border-ink-600 p-3" data-testid="delivery-trip">
          <div className="flex flex-wrap items-center justify-between gap-2"><strong className="break-words">{row.route}</strong><Badge color={row.status === 'CANCELLED' ? 'slate' : row.orderId ? 'green' : 'orange'}>{row.status === 'CANCELLED' ? 'Descartado' : row.order ? codigoPedido(row.order.orderNumber) : 'Sin venta'}</Badge></div>
          <p className="mt-1 text-sm text-mute">{row.driver.name} · {row.branch.name} · {dateText(row.performedOn)} · {row.distanceMeters / 1000} km · {row.tripsCount} {row.tripsCount === 1 ? 'viaje' : 'viajes'}</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="text-sm">Honorarios <strong><Money value={row.totalFeePyg} /></strong></span>{row.weeklyCloseId && <span className="text-xs text-mute">Incluido en cierre semanal</span>}
          {owner && !row.orderId && row.status === 'COMPLETED' && !row.weeklyCloseId && <Button variant="outline" onClick={() => setResolution({ row, action: 'link', orderId: '', reason: '' })}>Resolver sin venta</Button>}</div>
          {row.resolutionNote && <p className="mt-2 break-words text-sm text-mute">{row.resolvedBy?.name}: {row.resolutionNote}</p>}
        </article>)}
        {!loading && rows.length === 0 && <p className="text-sm text-mute">Todavía no hay viajes registrados.</p>}
        {rows.length === 200 && <Aviso>{unresolved ? 'Se muestran hasta 200 viajes sin venta. Al resolverlos, actualizá para ver los siguientes.' : 'Se muestran los 200 viajes más recientes. Los cierres calculan todos los viajes de la semana, aunque no estén en esta lista.'}</Aviso>}
      </div>
    </>}
    {tab === 'tarifas' && owner && <div className="space-y-3">
      <p className="text-sm text-mute">Precios por viaje y distancia total. Cada versión conserva su vigencia; desactivar una no cambia viajes anteriores.</p>
      {tariffs.map(rate => <article key={rate.id} className="rounded-xl border border-ink-600 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong>{rate.name}</strong><Badge color={rate.isActive ? 'green' : 'slate'}>{rate.isActive ? 'Activa' : 'Desactivada'}</Badge></div>
        <p className="my-2 text-sm text-mute">{dateText(rate.validFrom)} al {dateText(rate.validUntil)}</p>
        <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm">{rate.tiers.map((tier, index) => <div key={tier.upToKm}><dt className="text-mute">Más de {index ? rate.tiers[index - 1].upToKm : 0} hasta {tier.upToKm} km</dt><dd className="font-semibold"><Money value={tier.feePyg} /></dd></div>)}</dl>
        {rate.isActive && <Button className="mt-3" variant="outline" onClick={() => setDeactivate({ row: rate, reason: '' })}>Desactivar con motivo</Button>}
      </article>)}
      {!tariffs.length && <Aviso>No se cargaron tarifas. Ingresá los precios acordados; no hay importes predeterminados.</Aviso>}
    </div>}
    {tab === 'cierres' && owner && <div className="space-y-4">
      <GrillaCampos>
        <Campo ancho="documento" rotulo="Sucursal" htmlFor="weekly-branch"><Select id="weekly-branch" value={query.branchId} onChange={e => changeQuery('branchId', e.target.value)}><option value="">Elegí sucursal</option>{branchOptions}</Select></Campo>
        <Campo ancho="documento" rotulo="Repartidor" htmlFor="weekly-driver"><Select id="weekly-driver" value={query.driverId} onChange={e => changeQuery('driverId', e.target.value)}><option value="">Elegí repartidor</option>{driversFor(query.branchId).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</Select></Campo>
        <Campo ancho="documento" rotulo="Semana desde el lunes" htmlFor="weekly-start"><Input id="weekly-start" type="date" className="[color-scheme:light] dark:[color-scheme:dark]" value={query.weekStart} onChange={e => changeQuery('weekStart', e.target.value)} /></Campo>
        <Button className="md:mt-5" disabled={loading || busy} onClick={loadWeek}>Consultar semana</Button>
      </GrillaCampos>
      {weekly && <>
        <p className="text-sm text-mute">{close ? 'Semana cerrada. La foto original no cambia; el saldo actual refleja rendiciones posteriores y ajustes.' : 'Vista previa. Solo el cierre guarda la foto de esta semana; no registra cobros ni ingresos.'}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-xl border border-ink-600 p-3" data-testid="delivery-weekly-totals">
          {[['Honorarios', balance.feesPyg], ['Cobros del repartidor', balance.collectedPyg], ['Confirmado en tienda', balance.renderedPyg], ['Sin rendir ahora', balance.pendingPyg], ['Empresa debe al repartidor', balance.payablePyg], ['Repartidor debe a la empresa', balance.receivablePyg]].map(([label, value]) => <div key={label}><span className="block text-xs text-mute">{label}</span><strong className="whitespace-nowrap"><Money value={value} /></strong></div>)}
        </div>
        {weekly.unresolvedCount > 0 && <Aviso tono="error">Quedan {weekly.unresolvedCount} viajes sin venta. El dueño debe vincularlos o descartarlos con motivo antes de cerrar.</Aviso>}
        {close?.missingPaymentIds?.length > 0 && <Aviso tono="error">Faltan cobros que estaban en el cierre. Se conserva su foto; revisá la auditoría antes de ajustar.</Aviso>}
        {!close ? <Button disabled={busy || weekly.unresolvedCount > 0} onClick={() => setConfirmClose(true)}>Cerrar semana</Button> : <Button onClick={() => setAdjustment({ direction: '1', amount: '', reason: '', idempotencyKey: crypto.randomUUID() })}>Ajustar saldo con motivo</Button>}
        <details className="rounded-xl border border-ink-600 p-3"><summary className="min-h-11 cursor-pointer text-sm font-semibold">Viajes y cobros de la semana</summary>
          <div className="space-y-2 text-sm">{weekly.trips.map(row => <p key={row.id}>{row.route} · {row.tripsCount} viajes · <Money value={row.totalFeePyg} /></p>)}</div>
          <ul className="mt-3 space-y-2 text-sm">{(close?.collections || weekly.payments).map(row => <li key={row.id} className="break-words">{row.id} · <Money value={row.amountPyg} /> · {row.status === 'CONFIRMED' ? 'Confirmado' : row.status === 'PENDING' ? 'Sin rendir' : 'Sin efecto'}{row.deliverySettlementId ? ` · Rendición ${row.deliverySettlementId}` : ''}</li>)}</ul>
        </details>
        {close && <details className="rounded-xl border border-ink-600 p-3"><summary className="min-h-11 cursor-pointer text-sm font-semibold">Foto del cierre y ajustes</summary>
          <p className="text-sm">Saldo firmado al cerrar <Money value={close.balanceAtClosePyg} /> · {close.createdBy.name} · {new Date(close.createdAt).toLocaleString('es-PY')}</p>
          <p className="mt-1 text-xs text-mute">Positivo: empresa debe al repartidor. Negativo: repartidor debe a la empresa.</p>
          <ul className="mt-3 space-y-2 text-sm">{close.adjustments.map(row => <li key={row.id}><Money value={row.deltaPyg} /> · {row.reason} · {row.createdBy.name} · {new Date(row.createdAt).toLocaleString('es-PY')}</li>)}</ul>
        </details>}
      </>}
    </div>}

    <Modal open={Boolean(trip)} onClose={() => !busy && setTrip(null)} title="Registrar viajes realizados" size="formulario" busy={busy} dirty={Boolean(trip && (trip.route || trip.driverId || trip.orderId || trip.distanceKm || Number(trip.tripsCount) !== 1 || trip.performedOn !== today() || trip.branchId !== initialBranch))}>
      {trip && <form className={formClass} onSubmit={e => { e.preventDefault(); run(() => api.post('/api/delivery/trips', { ...trip, distanceKm: Number(trip.distanceKm), tripsCount: Number(trip.tripsCount) }), 'Viajes registrados', () => setTrip(null)) }}>
        <GrillaCampos>
          <Campo ancho="documento" rotulo="Sucursal" htmlFor="trip-branch"><Select id="trip-branch" required value={trip.branchId} onChange={e => setTrip({ ...trip, branchId: e.target.value, driverId: '', orderId: '' })}><option value="">Elegí sucursal</option>{branchOptions}</Select></Campo>
          <Campo ancho="documento" rotulo="Repartidor" htmlFor="trip-driver"><Select id="trip-driver" required value={trip.driverId} onChange={e => setTrip({ ...trip, driverId: e.target.value })}><option value="">Elegí repartidor</option>{driversFor(trip.branchId).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</Select></Campo>
          <Campo ancho="documento" rotulo="Fecha realizada" htmlFor="trip-date"><Input id="trip-date" required type="date" className="[color-scheme:light] dark:[color-scheme:dark]" max={today()} value={trip.performedOn} onChange={e => setTrip({ ...trip, performedOn: e.target.value })} /></Campo>
        </GrillaCampos>
        <FormField label="Ruta o línea" htmlFor="trip-route"><Input id="trip-route" required maxLength={200} value={trip.route} onChange={e => setTrip({ ...trip, route: e.target.value })} placeholder="Ej.: Centro → San Lorenzo" /></FormField>
        <GrillaCampos>
          <Campo ancho="corto" rotulo="Distancia total por viaje (km)" htmlFor="trip-distance"><Input id="trip-distance" required type="number" min="0.001" max="28" step="0.001" inputMode="decimal" value={trip.distanceKm} onChange={e => setTrip({ ...trip, distanceKm: e.target.value })} /></Campo>
          <Campo ancho="corto" rotulo="Cantidad de viajes" htmlFor="trip-count"><Input id="trip-count" required type="number" min="1" max="100" step="1" inputMode="numeric" value={trip.tripsCount} onChange={e => setTrip({ ...trip, tripsCount: e.target.value })} /></Campo>
        </GrillaCampos>
        <FormField label="Pedido asociado" htmlFor="trip-order"><Select id="trip-order" value={trip.orderId} onChange={e => setTrip({ ...trip, orderId: e.target.value })}><option value="">Sin venta · requiere resolución del dueño</option>{orderOptions(trip.branchId)}</Select></FormField>
        {tier ? <p className="text-sm">{activeTariff.name}: <Money value={tier.feePyg} /> por viaje. Total estimado <strong><Money value={tier.feePyg * Number(trip.tripsCount || 0)} /></strong></p> : <Aviso>No hay tarifa para esta fecha y distancia. El dueño debe configurarla antes de guardar.</Aviso>}
        <p className="text-xs text-mute">Registrar viajes no crea pedidos, pagos ni ventas. El cobro del cliente se registra y se rinde por el circuito habitual.</p>
        {error && <Aviso tono="error">{error}</Aviso>}<Button type="submit" disabled={busy || !tier}>Guardar viajes</Button>
      </form>}
    </Modal>
    <Modal open={Boolean(tariff)} onClose={() => !busy && setTariff(null)} title="Nueva tarifa del repartidor" size="formulario" busy={busy} dirty={Boolean(tariff && (tariff.name || tariff.validUntil || tariff.validFrom !== today() || tariff.tiers.length !== 1 || tariff.tiers[0].upToKm !== 28 || tariff.tiers[0].feePyg !== ''))}>
      {tariff && <form className={formClass} onSubmit={e => { e.preventDefault(); run(() => api.post('/api/delivery/tariffs', tariff), 'Tarifa guardada', () => setTariff(null)) }}>
        <FormField label="Nombre" htmlFor="tariff-name"><Input id="tariff-name" required maxLength={100} placeholder="Ej.: Octubre 2026" value={tariff.name} onChange={e => setTariff({ ...tariff, name: e.target.value })} /></FormField>
        <GrillaCampos><Campo ancho="documento" rotulo="Vigente desde" htmlFor="tariff-from"><Input id="tariff-from" required type="date" className="[color-scheme:light] dark:[color-scheme:dark]" value={tariff.validFrom} onChange={e => setTariff({ ...tariff, validFrom: e.target.value })} /></Campo><Campo ancho="documento" rotulo="Hasta inclusive" htmlFor="tariff-until"><Input id="tariff-until" required type="date" className="[color-scheme:light] dark:[color-scheme:dark]" min={tariff.validFrom} value={tariff.validUntil} onChange={e => setTariff({ ...tariff, validUntil: e.target.value })} /></Campo></GrillaCampos>
        <p className="text-sm text-mute">Tramos en orden ascendente. El primero parte de 0 km y el último debe cubrir 28 km. Ingresá cada precio acordado; cero solo si el viaje es gratuito.</p>
        {tariff.tiers.map((row, index) => <GrillaCampos key={index}>
          <Campo ancho="corto" rotulo={`Tramo ${index + 1}: hasta km`} htmlFor={`tier-km-${index}`}><Input id={`tier-km-${index}`} required type="number" min="1" max="28" step="1" value={row.upToKm} onChange={e => setTariff({ ...tariff, tiers: tariff.tiers.map((tier, i) => i === index ? { ...tier, upToKm: Number(e.target.value) } : tier) })} /></Campo>
          <Campo ancho="documento" rotulo="Honorario por viaje" htmlFor={`tier-fee-${index}`}><MoneyInput id={`tier-fee-${index}`} required value={row.feePyg} onValueChange={value => setTariff({ ...tariff, tiers: tariff.tiers.map((tier, i) => i === index ? { ...tier, feePyg: value } : tier) })} /></Campo>
          {tariff.tiers.length > 1 && <Button className="md:mt-5" variant="outline" onClick={() => setTariff({ ...tariff, tiers: tariff.tiers.filter((_, i) => i !== index) })} aria-label={`Quitar tramo ${index + 1}`}>Quitar</Button>}
        </GrillaCampos>)}
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={tariff.tiers.length >= 28} onClick={() => setTariff({ ...tariff, tiers: [...tariff.tiers, { upToKm: '', feePyg: '' }] })}>Agregar tramo</Button><Button type="submit" disabled={busy}>Guardar tarifa</Button></div>
        {error && <Aviso tono="error">{error}</Aviso>}
      </form>}
    </Modal>
    <Modal open={Boolean(resolution || deactivate)} onClose={() => { if (!busy) { setResolution(null); setDeactivate(null) } }} title={resolution ? 'Resolver viaje sin venta' : 'Desactivar tarifa'} size="corto" busy={busy} dirty={Boolean(resolution?.reason || resolution?.orderId || (resolution && resolution.action !== 'link') || deactivate?.reason)}>
      {resolution && <form className={formClass} onSubmit={e => { e.preventDefault(); run(() => api.patch(`/api/delivery/trips/${resolution.row.id}`, { action: resolution.action, orderId: resolution.orderId, reason: resolution.reason }), 'Viaje resuelto', () => setResolution(null)) }}>
        <FormField label="Acción" htmlFor="trip-resolution"><Select id="trip-resolution" value={resolution.action} onChange={e => setResolution({ ...resolution, action: e.target.value })}><option value="link">Vincular a un pedido existente</option><option value="discard">Descartar del cierre</option></Select></FormField>
        {resolution.action === 'link' ? <FormField label="Pedido" htmlFor="resolution-order"><Select id="resolution-order" required value={resolution.orderId} onChange={e => setResolution({ ...resolution, orderId: e.target.value })}><option value="">Elegí pedido</option>{orderOptions(resolution.row.branchId)}</Select></FormField> : <Aviso>El viaje quedará descartado con motivo y no sumará honorarios en el cierre. No se borra el registro.</Aviso>}
        <FormField label="Motivo" htmlFor="resolution-reason"><Textarea id="resolution-reason" required minLength={3} maxLength={500} value={resolution.reason} onChange={e => setResolution({ ...resolution, reason: e.target.value })} /></FormField>
        {error && <Aviso tono="error">{error}</Aviso>}<Button type="submit" disabled={busy}>Guardar resolución</Button>
      </form>}
      {deactivate && <form className={formClass} onSubmit={e => { e.preventDefault(); run(() => api.patch(`/api/delivery/tariffs/${deactivate.row.id}`, { reason: deactivate.reason }), 'Tarifa desactivada', () => setDeactivate(null)) }}>
        <p className="text-sm text-mute">No cambia los honorarios de viajes ya registrados.</p><FormField label="Motivo" htmlFor="tariff-reason"><Textarea id="tariff-reason" required minLength={3} maxLength={500} value={deactivate.reason} onChange={e => setDeactivate({ ...deactivate, reason: e.target.value })} /></FormField>{error && <Aviso tono="error">{error}</Aviso>}<Button type="submit" disabled={busy}>Desactivar tarifa</Button>
      </form>}
    </Modal>
    <ConfirmDialog open={confirmClose} onCancel={() => setConfirmClose(false)} title="¿Cerrar esta semana?" description="Se guarda una foto auditable de viajes y cobros. No se podrán agregar viajes en esta semana. Las rendiciones posteriores actualizarán solo el saldo actual." confirmLabel="Cerrar semana" busy={busy} onConfirm={() => run(() => api.post('/api/delivery/weekly', query), 'Semana cerrada', () => { setConfirmClose(false); loadWeek() })} />
    <Modal open={Boolean(adjustment)} onClose={() => !busy && setAdjustment(null)} title="Ajustar saldo del repartidor" size="corto" busy={busy} dirty={Boolean(adjustment && (adjustment.reason || adjustment.amount !== '' || adjustment.direction !== '1'))}>
      {adjustment && <form className={formClass} onSubmit={e => { e.preventDefault(); run(() => api.post(`/api/delivery/weekly/${close.id}/adjustments`, { deltaPyg: Number(adjustment.direction) * Number(adjustment.amount), reason: adjustment.reason, idempotencyKey: adjustment.idempotencyKey }), 'Ajuste registrado', () => { setAdjustment(null); loadWeek() }) }}>
        <FormField label="Sentido del ajuste" htmlFor="adjust-direction"><Select id="adjust-direction" value={adjustment.direction} onChange={e => setAdjustment({ ...adjustment, direction: e.target.value })}><option value="1">Aumentar saldo a favor del repartidor</option><option value="-1">Disminuir saldo a favor del repartidor</option></Select></FormField>
        <FormField label="Importe del ajuste" htmlFor="adjust-amount"><MoneyInput id="adjust-amount" required value={adjustment.amount} onValueChange={value => setAdjustment({ ...adjustment, amount: value })} /></FormField>
        <FormField label="Motivo" htmlFor="adjust-reason"><Textarea id="adjust-reason" required minLength={3} maxLength={500} value={adjustment.reason} onChange={e => setAdjustment({ ...adjustment, reason: e.target.value })} /></FormField>
        {error && <Aviso tono="error">{error}</Aviso>}<Button type="submit" disabled={busy || !adjustment.amount}>Registrar ajuste</Button>
      </form>}
    </Modal>
  </section>
}
