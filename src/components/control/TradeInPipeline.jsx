import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge, Button, Card, Input, Select, Textarea } from '@/components/ui'
import { useSesion } from '@/lib/sesion'
import { gs } from '@/utils/calculos'
import {
  TRADE_IN_STATUSES, TRADE_IN_DESTINATIONS, TRADE_IN_TRANSITIONS,
  loadDemoTradeIns, updateDemoTradeIn, tradeInsApi, tradeInValuePyg, normalizeTradeInHistory,
} from '@/lib/tradeInPipeline'

function Reference({ value }) {
  return <span className="break-all">{value || '—'}</span>
}

function Device({ item, busy, onSave }) {
  const transitions = TRADE_IN_TRANSITIONS[item.status] || []
  const [status, setStatus] = useState(transitions[0] || '')
  const [notes, setNotes] = useState('')
  const [repairCostPyg, setRepairCostPyg] = useState('')
  const [pricePyg, setPricePyg] = useState('')
  const [destination, setDestination] = useState('NORMAL')
  const blocked = busy || Boolean(item.publicationState)
  const sourceOrder = item.order || { id: item.orderId, orderNumber: item.orderNumber, customer: { name: item.customerName }, seller: { name: item.sellerName } }
  const resaleOrders = [...new Map((item.product?.orderItems || []).filter((line) => line.order?.id || line.orderId)
    .map((line) => [line.order?.id || line.orderId, line.order || { id: line.orderId }])).values()]
  const orderAnchor = (order) => `trade-in-${item.id}-order-${order.id}`
  const price = item.pricePyg ?? item.product?.pricePyg
  const publishedDestination = item.destination || item.product?.destination
  const canAddRepairCost = item.status === 'REPAIR' || status === 'REPAIR'

  async function submit(event) {
    event.preventDefault()
    await onSave(item, { id: item.id, status, notes,
      ...(canAddRepairCost && repairCostPyg !== '' && Number(repairCostPyg) !== 0 ? { repairCostPyg } : {}),
      ...(status === 'STOCK' ? { pricePyg, destination } : {}) })
  }

  return <Card className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h3 className="font-semibold">{item.model}</h3><p className="break-all text-sm text-mute">Serial / IMEI: {item.serial}</p></div>
      <Badge color={item.status === 'STOCK' ? 'green' : 'slate'}>{TRADE_IN_STATUSES[item.status] || item.status}</Badge>
    </div>
    <p className="whitespace-pre-wrap text-sm text-mute">{item.conditionNotes || 'Sin observaciones de recepción.'}</p>
    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
      <div><dt className="text-mute">Valor de toma</dt><dd>{gs(tradeInValuePyg(item))}</dd></div>
      <div><dt className="text-mute">Reparación</dt><dd>{gs(item.repairCostPyg || 0)}</dd></div>
      <div><dt className="text-mute">Total invertido</dt><dd>{gs(tradeInValuePyg(item) + Number(item.repairCostPyg || 0))}</dd></div>
      {price != null && <div><dt className="text-mute">Precio publicado</dt><dd>{gs(price)}</dd></div>}
      {publishedDestination && <div><dt className="text-mute">Destino</dt><dd>{TRADE_IN_DESTINATIONS[publishedDestination] || publishedDestination}</dd></div>}
    </dl>
    <details className="text-sm"><summary className="cursor-pointer font-medium">Referencias e historial</summary>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div><dt className="text-mute">Venta de origen</dt><dd><a className="break-all text-fono-light underline" href={`#${orderAnchor(sourceOrder)}`}>{sourceOrder.orderNumber || sourceOrder.id}</a></dd></div>
        <div><dt className="text-mute">Pago</dt><dd><Reference value={item.paymentId} /></dd></div>
        <div><dt className="text-mute">Cliente</dt><dd><Reference value={item.customerName || item.order?.customer?.name || item.customerId} /></dd></div>
        <div><dt className="text-mute">Vendedor</dt><dd><Reference value={item.sellerName || item.order?.seller?.name || item.sellerId} /></dd></div>
        <div><dt className="text-mute">Producto</dt><dd><Reference value={item.productId} /></dd></div>
      </dl>
      <div className="mt-3 space-y-2">
        {resaleOrders.length > 0 && <p>Ventas POS del equipo: {resaleOrders.map((order) => <a key={order.id} href={`#${orderAnchor(order)}`} className="mr-3 break-all text-fono-light underline">{order.orderNumber || order.id}</a>)}</p>}
        {[sourceOrder, ...resaleOrders.filter((order) => order.id !== sourceOrder.id)].map((order) => <div id={orderAnchor(order)} key={order.id} className="scroll-mt-4 rounded-lg border border-ink-600 p-3">
          <p className="break-all">Pedido {order.orderNumber || order.id}</p>
          <p className="text-mute">Cliente: {order.customer?.name || order.customerName || order.customerId || '—'} · Vendedor: {order.seller?.name || order.sellerName || order.sellerId || '—'}</p>
          {order.status && <p className="text-mute">Estado del pedido: {order.status}</p>}
        </div>)}
      </div>
      {item.history?.length ? <ol className="mt-3 space-y-2 border-t border-ink-600 pt-3">{item.history.map(normalizeTradeInHistory).map((entry, index) => <li key={entry.id || index} className="text-mute">
        <span>{entry.at || entry.createdAt ? new Date(entry.at || entry.createdAt).toLocaleString('es-PY') : 'Sin fecha'}</span>
        {entry.actorName && <span> · {entry.actorName}</span>}
        {entry.toStatus ? <span> · {TRADE_IN_STATUSES[entry.fromStatus] || entry.fromStatus || 'Ingreso'} → {TRADE_IN_STATUSES[entry.toStatus] || entry.toStatus}</span> : <span> · {entry.action === 'TRADE_IN_REPAIR_COST_ADDED' ? 'Costo de reparación agregado' : 'Registro de auditoría'}</span>}
        {entry.incrementPyg > 0 && <span> · Costo adicional: {gs(entry.incrementPyg)}</span>}
        {entry.repairCostPyg != null && <span> · Reparación: {gs(entry.repairCostPyg)}</span>}
        {entry.destination && <span> · {TRADE_IN_DESTINATIONS[entry.destination]}: {gs(entry.pricePyg)}</span>}
        {entry.notes && <p className="whitespace-pre-wrap">{entry.notes}</p>}
      </li>)}</ol> : <p className="mt-3 text-mute">No hay historial informado.</p>}
      {item.notes && <p className="mt-3 whitespace-pre-wrap text-mute">Última nota: {item.notes}</p>}
    </details>
    {item.publicationState && <p role="alert" className="text-sm text-bad">Publicación interrumpida. Revisá el inventario antes de reconciliar el registro; el reintento está bloqueado.</p>}
    {transitions.length > 0 && <form onSubmit={submit}>
      <fieldset disabled={blocked} className="grid gap-3 border-t border-ink-600 pt-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm"><span>Mover a</span><Select value={status} onChange={(event) => setStatus(event.target.value)}>{transitions.map((next) => <option key={next} value={next}>{TRADE_IN_STATUSES[next]}</option>)}</Select></label>
        {canAddRepairCost && <label className="space-y-1 text-sm"><span>Costo adicional (₲, opcional)</span><Input type="number" min="0" step="1" value={repairCostPyg} placeholder="Importe a sumar al total" onChange={(event) => setRepairCostPyg(event.target.value)} /></label>}
        {status === 'STOCK' && <>
          <label className="space-y-1 text-sm"><span>Precio de venta (₲)</span><Input type="number" min="1" step="1" required value={pricePyg} onChange={(event) => setPricePyg(event.target.value)} /></label>
          <label className="space-y-1 text-sm"><span>Destino</span><Select value={destination} onChange={(event) => setDestination(event.target.value)}>{Object.entries(TRADE_IN_DESTINATIONS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</Select></label>
        </>}
        <label className="space-y-1 text-sm sm:col-span-2"><span>{status === 'SOLD_EXTERNAL' ? 'Comprador y destino (obligatorio)' : 'Notas del movimiento'}</span><Textarea rows={2} required={status === 'SOLD_EXTERNAL'} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <Button type="submit" disabled={blocked}>{busy ? 'Guardando…' : status === 'STOCK' ? 'Publicar y sumar 1 unidad' : 'Guardar movimiento'}</Button>
      </fieldset>
    </form>}
  </Card>
}

export default function TradeInPipeline() {
  const { esDemo, sesion, usuario } = useSesion()
  const admin = Boolean(sesion?.esPropietario || usuario?.role === 'ADMIN')
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const mutation = useRef(false)
  const generation = useRef(0)

  const load = useCallback(async () => {
    if (!admin || mutation.current) return
    const current = ++generation.current
    setBusy(true); setError('')
    try {
      const rows = esDemo ? loadDemoTradeIns() : await tradeInsApi.list()
      if (!Array.isArray(rows)) throw new Error('La API no devolvió una lista de equipos.')
      if (current === generation.current) { setItems(rows); setUncertain(false) }
    } catch (err) { if (current === generation.current) setError(err.message || 'No se pudieron cargar los equipos.') }
    finally { if (current === generation.current) setBusy(false) }
  }, [admin, esDemo])

  useEffect(() => {
    setItems([])
    load()
    const refresh = () => { load() }
    if (esDemo) { window.addEventListener('mobos:trade-ins-updated', refresh); window.addEventListener('storage', refresh) }
    return () => { generation.current++; window.removeEventListener('mobos:trade-ins-updated', refresh); window.removeEventListener('storage', refresh) }
  }, [load, esDemo])

  async function save(item, patch) {
    if (!admin || busy || mutation.current || uncertain) return
    mutation.current = true
    setBusy(true); setError(''); setMessage('')
    try {
      const updated = esDemo ? updateDemoTradeIn(patch) : await tradeInsApi.update(item, patch)
      if (!updated?.id || updated.id !== item.id || updated.status !== patch.status) throw new Error('No se recibió confirmación del movimiento. Actualizá antes de reintentar.')
      setItems((rows) => rows.map((row) => row.id === item.id ? { ...row, ...updated } : row))
      setMessage(patch.status === 'STOCK' ? 'Equipo publicado: una unidad en inventario.' : 'Movimiento guardado.')
    } catch (err) {
      setError(err.message || 'No se pudo guardar el movimiento.')
      setUncertain(true)
    } finally { mutation.current = false; setBusy(false) }
  }

  if (!admin) return <Card>El pipeline de equipos recibidos está disponible para administradores.</Card>
  const search = query.trim().toLocaleLowerCase()
  const visible = items.filter((item) => (!filter || item.status === filter) &&
    [item.serial, item.model, item.orderId, item.orderNumber, item.customerName, item.sellerName, item.order?.orderNumber, item.order?.customer?.name].some((value) => String(value || '').toLocaleLowerCase().includes(search)))

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold">Equipos recibidos como pago</h2><p className="mt-1 text-sm text-mute">Recepción, revisión, reparación y destino de cada equipo.</p></div><Button variant="outline" disabled={busy} onClick={load}>Actualizar</Button></div>
    {esDemo && <p className="text-sm text-mute">Demo local: registrá equipos sintéticos desde una venta demo. La recepción no suma stock ni crea clientes reales.</p>}
    <div className="grid gap-3 sm:grid-cols-2"><Input aria-label="Buscar equipos" placeholder="Serial, modelo, venta o referencia…" value={query} onChange={(event) => setQuery(event.target.value)} /><Select aria-label="Filtrar estado" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">Todos los estados ({items.length})</option>{Object.entries(TRADE_IN_STATUSES).map(([value, text]) => <option key={value} value={value}>{text} ({items.filter((item) => item.status === value).length})</option>)}</Select></div>
    {error && <p role="alert" className="rounded-lg bg-bad/10 p-3 text-sm text-bad">{error}</p>}
    {uncertain && <p className="text-sm text-mute">Actualizá la lista para verificar el estado antes de otro movimiento.</p>}
    {message && <p role="status" className="text-sm text-ok">{message}</p>}
    {busy && <p role="status" className="text-sm text-mute">Procesando…</p>}
    {!busy && !error && !visible.length && <Card>No hay equipos que coincidan. Los equipos aparecen después de registrarlos como pago de una venta.</Card>}
    <div className="grid items-start gap-4 xl:grid-cols-2">{visible.map((item) => <Device key={`${item.id}:${item.status}:${item.updatedAt || ''}`} item={item} busy={busy || uncertain} onSave={save} />)}</div>
  </div>
}
