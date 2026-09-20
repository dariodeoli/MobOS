import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge, Button, Card, Input, Label, MoneyInput, Select, Textarea } from '@/components/ui'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api'
import { gs } from '@/utils/calculos'
import { normalizarModelo } from '@/utils/tradeInCheckout'
import { cn } from '@/lib/utils'
import Icon from '@/components/shared/Icon'
import { codigoPedido } from '@/utils/pedido'
import {
  TRADE_IN_STATUSES, TRADE_IN_DESTINATIONS, TRADE_IN_TRANSITIONS,
  loadDemoTradeIns, updateDemoTradeIn, tradeInsApi, tradeInValuePyg, normalizeTradeInHistory,
} from '@/lib/tradeInPipeline'

function Reference({ value }) {
  return <span className="break-all">{value || '—'}</span>
}

function safePhotoUrl(value) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null
  } catch { return null }
}

// Fila compacta del tablero: lo esencial del equipo. La tarjeta completa
// (diagnóstico, accesorios, fotos, referencias, historial y acciones) se
// despliega debajo, así el listado deja de ocupar media pantalla por equipo.
const GRID_TRADEIN = 'grid min-w-[58rem] grid-cols-[minmax(9rem,1.3fr)_minmax(7rem,1fr)_7rem_6rem_6rem_6rem_7rem_6rem_1.5rem] items-center gap-x-2'
const CELDA_TRADEIN = 'truncate text-[10px] font-bold uppercase tracking-wider text-mute'
const fechaTradeIn = (value) => {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }).replace('.', '')
}

function FilaDevice({ item, abierto, onClick }) {
  const publicado = item.pricePyg ?? item.product?.pricePyg
  const invertido = tradeInValuePyg(item) + Number(item.repairCostPyg || 0)
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="tradein-fila"
      onClick={onClick}
      onKeyDown={(event) => { if (event.key === 'Enter') onClick?.() }}
      className={cn(GRID_TRADEIN, 'cursor-pointer rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2 transition hover:border-fono/40', abierto && 'border-fono/40')}
    >
      <span className="min-w-0">
        <b className="block truncate text-[13px] font-semibold" title={item.model}>{item.model || 'Equipo'}</b>
        <span className="mt-0.5 block truncate font-mono text-[10px] text-mute" title={item.serial}>{item.serial || 'Sin serial'}</span>
      </span>
      <span className="truncate text-xs text-mute" title={item.customerName || item.order?.customer?.name || undefined}>{item.customerName || item.order?.customer?.name || 'Sin cliente'}</span>
      <span className="min-w-0"><Badge color={item.status === 'STOCK' ? 'green' : item.status === 'SOLD_EXTERNAL' ? 'slate' : item.status === 'REPAIR' ? 'orange' : 'blue'} className="w-fit whitespace-nowrap px-1.5 py-0.5 text-[10px]">{TRADE_IN_STATUSES[item.status] || item.status}</Badge></span>
      <span className="truncate text-xs tabular-nums text-mute">{gs(tradeInValuePyg(item))}</span>
      <span className="truncate text-xs tabular-nums text-mute">{item.repairCostPyg ? gs(item.repairCostPyg) : '—'}</span>
      <span className="truncate text-xs tabular-nums text-mute">{gs(invertido)}</span>
      <span className="truncate text-xs tabular-nums text-fore">{publicado != null ? gs(publicado) : '—'}</span>
      <span className="truncate text-xs text-mute" title={item.createdAt ? new Date(item.createdAt).toLocaleString('es-PY') : undefined}>{fechaTradeIn(item.createdAt)}</span>
      <span className="flex justify-end"><Icon name="chevron" className={cn('h-3.5 w-3.5 shrink-0 text-mute transition', abierto ? 'rotate-180' : '-rotate-90')} /></span>
    </div>
  )
}

function Device({ item, busy, onSave }) {
  const transitions = TRADE_IN_TRANSITIONS[item.status] || []
  const [status, setStatus] = useState(transitions[0] || '')
  const [notes, setNotes] = useState('')
  const [repairCostPyg, setRepairCostPyg] = useState('')
  const [pricePyg, setPricePyg] = useState('')
  const [destination, setDestination] = useState('NORMAL')
  const [diagnosis, setDiagnosis] = useState(item.diagnosis || '')
  const [technicianName, setTechnicianName] = useState(item.technicianName || '')
  const [accessoriesText, setAccessoriesText] = useState((item.accessories || []).join('\n'))
  const [photosText, setPhotosText] = useState((item.photos || []).join('\n'))
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
      diagnosis,
      technicianName,
      accessories: accessoriesText.split(/\n|,/).map((value) => value.trim()).filter(Boolean),
      photos: photosText.split('\n').map((value) => value.trim()).filter(Boolean),
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
    {(item.diagnosis || item.technicianName || item.accessories?.length || item.photos?.length) && <section className="rounded-lg border border-ink-600 p-3 text-sm">
      <h4 className="font-medium">Diagnóstico y recepción</h4>
      {item.diagnosis && <p className="mt-2 whitespace-pre-wrap text-mute">{item.diagnosis}</p>}
      {item.technicianName && <p className="mt-2 text-mute">Técnico: {item.technicianName}</p>}
      {item.accessories?.length > 0 && <p className="mt-2 text-mute">Accesorios: {item.accessories.join(', ')}</p>}
      {item.photos?.length > 0 && <p className="mt-2 text-mute">Fotos: {item.photos.map(safePhotoUrl).filter(Boolean).map((url, index) => <a key={url} className="mr-3 text-fono-light underline" href={url} target="_blank" rel="noreferrer">Foto {index + 1}</a>)}</p>}
    </section>}
    <details className="text-sm"><summary className="cursor-pointer font-medium">Referencias e historial</summary>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div><dt className="text-mute">Venta de origen</dt><dd><a className="break-all text-fono-light underline" href={`#${orderAnchor(sourceOrder)}`}>{codigoPedido(sourceOrder.orderNumber) || sourceOrder.id}</a></dd></div>
        <div><dt className="text-mute">Pago</dt><dd><Reference value={item.paymentId} /></dd></div>
        <div><dt className="text-mute">Cliente</dt><dd><Reference value={item.customerName || item.order?.customer?.name || item.customerId} /></dd></div>
        <div><dt className="text-mute">Vendedor</dt><dd><Reference value={item.sellerName || item.order?.seller?.name || item.sellerId} /></dd></div>
        <div><dt className="text-mute">Producto</dt><dd><Reference value={item.productId} /></dd></div>
      </dl>
      <div className="mt-3 space-y-2">
        {resaleOrders.length > 0 && <p>Ventas POS del equipo: {resaleOrders.map((order) => <a key={order.id} href={`#${orderAnchor(order)}`} className="mr-3 break-all text-fono-light underline">{codigoPedido(order.orderNumber) || order.id}</a>)}</p>}
        {[sourceOrder, ...resaleOrders.filter((order) => order.id !== sourceOrder.id)].map((order) => <div id={orderAnchor(order)} key={order.id} className="scroll-mt-4 rounded-lg border border-ink-600 p-3">
          <p className="break-all">Pedido {codigoPedido(order.orderNumber) || order.id}</p>
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
        {canAddRepairCost && <label className="space-y-1 text-sm"><span>Costo adicional (₲, opcional)</span><MoneyInput value={repairCostPyg} placeholder="Importe a sumar al total" onValueChange={setRepairCostPyg} /></label>}
        {status === 'STOCK' && <>
          <label className="space-y-1 text-sm"><span>Precio de venta (₲)</span><MoneyInput required value={pricePyg} onValueChange={setPricePyg} /></label>
          <label className="space-y-1 text-sm"><span>Destino</span><Select value={destination} onChange={(event) => setDestination(event.target.value)}>{Object.entries(TRADE_IN_DESTINATIONS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</Select></label>
        </>}
        <label className="space-y-1 text-sm sm:col-span-2"><span>Diagnóstico</span><Textarea rows={2} value={diagnosis} placeholder="Estado técnico, batería, detalles de revisión…" onChange={(event) => setDiagnosis(event.target.value)} /></label>
        <label className="space-y-1 text-sm"><span>Técnico responsable</span><Input value={technicianName} placeholder="Nombre del técnico" onChange={(event) => setTechnicianName(event.target.value)} /></label>
        <label className="space-y-1 text-sm"><span>Accesorios recibidos</span><Input value={accessoriesText} placeholder="Caja, cable, cargador…" onChange={(event) => setAccessoriesText(event.target.value)} /></label>
        <label className="space-y-1 text-sm sm:col-span-2"><span>Enlaces de fotos</span><Textarea rows={2} value={photosText} placeholder="Una URL https:// por línea" onChange={(event) => setPhotosText(event.target.value)} /><span className="block text-xs text-mute">Los enlaces quedan en la trazabilidad. La carga directa de archivos se habilitará al configurar almacenamiento privado.</span></label>
        <label className="space-y-1 text-sm sm:col-span-2"><span>{status === 'SOLD_EXTERNAL' ? 'Comprador y destino (obligatorio)' : 'Notas del movimiento'}</span><Textarea rows={2} required={status === 'SOLD_EXTERNAL'} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <Button type="submit" disabled={blocked}>{busy ? 'Guardando…' : status === 'STOCK' ? 'Publicar y sumar 1 unidad' : 'Guardar movimiento'}</Button>
      </fieldset>
    </form>}
  </Card>
}

const GRID_VALORACIONES = 'grid min-w-[52rem] grid-cols-[minmax(11rem,1.4fr)_6rem_6.5rem_7rem_7rem_6rem_8rem] items-center gap-x-2'
const CELDA_VALORACIONES = 'truncate text-[10px] font-bold uppercase tracking-wider text-mute'
const CONDICIONES_VALUACION = { NEW: 'Nuevo', USED: 'Seminuevo', REFURBISHED: 'Reacondicionado' }
const VALUACION_VACIA = { model: '', storage: '', condition: 'USED', baseValuePyg: '', maxValuePyg: '', notes: '', isActive: true }

// Tabla de valores de toma que alimenta la sugerencia del POS: el vendedor ve
// el valor base del modelo y la condición, y decide si lo usa o lo cambia.
function Valuaciones({ esDemo }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const lock = useRef(false)

  const load = useCallback(async () => {
    if (esDemo) return
    setLoading(true); setError('')
    try {
      const data = await api.get('/api/device-valuations?all=1')
      if (!Array.isArray(data)) throw new Error('La API no devolvió una lista de valores.')
      setRows(data)
    } catch (err) { setError(err.message || 'No se pudieron cargar los valores de toma.') }
    finally { setLoading(false) }
  }, [esDemo])

  useEffect(() => { load() }, [load])

  function openForm(row = null) {
    setEditingId(row?.id ?? null)
    setForm(row ? { model: row.model, storage: row.storage || '', condition: row.condition, baseValuePyg: row.baseValuePyg,
      maxValuePyg: row.maxValuePyg ?? '', notes: row.notes || '', isActive: row.isActive } : { ...VALUACION_VACIA })
    setMessage('')
  }

  function change(key, value) { setForm(current => ({ ...current, [key]: value })) }

  async function guardar(event) {
    event.preventDefault()
    if (lock.current || !form) return
    const model = form.model.trim()
    const baseValuePyg = Number(form.baseValuePyg)
    const maxValuePyg = String(form.maxValuePyg ?? '').trim() === '' ? null : Number(form.maxValuePyg)
    if (!model) { setError('Indicá el modelo.'); return }
    if (!Number.isSafeInteger(baseValuePyg) || baseValuePyg <= 0) { setError('El valor base debe ser un entero positivo.'); return }
    if (maxValuePyg !== null && (!Number.isSafeInteger(maxValuePyg) || maxValuePyg < baseValuePyg)) { setError('El valor máximo debe ser mayor o igual al valor base.'); return }
    lock.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const payload = { model, storage: form.storage.trim(), condition: form.condition, baseValuePyg, maxValuePyg, notes: form.notes.trim(), isActive: form.isActive }
      const saved = editingId ? await api.patch('/api/device-valuations', { id: editingId, ...payload }) : await api.post('/api/device-valuations', payload)
      setRows(current => current.some(row => row.id === saved.id) ? current.map(row => row.id === saved.id ? saved : row) : [saved, ...current])
      setMessage(editingId ? 'Valor actualizado.' : 'Valor creado. El POS ya puede sugerirlo.')
      setForm(null); setEditingId(null)
    } catch (err) { setError(err.message || 'No se pudo guardar el valor.') }
    finally { lock.current = false; setBusy(false) }
  }

  async function alternar(row) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const saved = await api.patch('/api/device-valuations', { id: row.id, isActive: !row.isActive })
      setRows(current => current.map(item => item.id === saved.id ? saved : item))
      setMessage(saved.isActive ? 'Valor activado.' : 'Valor desactivado: el POS deja de sugerirlo y conserva el historial.')
    } catch (err) { setError(err.message || 'No se pudo cambiar el estado del valor.') }
    finally { lock.current = false; setBusy(false) }
  }

  const search = normalizarModelo(query)
  const visibles = search ? rows.filter(row => normalizarModelo(row.model).includes(search)) : rows

  return <Card className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-bold">Valores de toma</h2>
        <p className="mt-1 text-sm text-mute">Sugerencia por modelo, capacidad y condición. El vendedor la ve al cargar el canje y puede cambiarla.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy || loading || !!form} onClick={load}>Actualizar</Button>
        <Button type="button" disabled={busy || loading || !!form} onClick={() => openForm()}>Añadir valor</Button>
      </div>
    </div>
    {esDemo && <p className="text-sm text-mute">Demo: los valores de toma se administran en la empresa real.</p>}
    {loading && <p role="status" className="text-sm text-mute">Cargando valores…</p>}
    {error && <p role="alert" className="rounded-lg bg-bad/10 p-3 text-sm text-bad">{error}</p>}
    {message && <p role="status" className="text-sm text-ok">{message}</p>}
    {!esDemo && <Input aria-label="Buscar valores por modelo" placeholder="Buscar por modelo…" value={query} onChange={(event) => setQuery(event.target.value)} />}
    {form && <form onSubmit={guardar} className="space-y-4 rounded-lg border border-ink-600 p-4">
      <h3 className="text-sm font-semibold">{editingId ? 'Editar valor de toma' : 'Nuevo valor de toma'}</h3>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="dv-model">Modelo</Label><Input id="dv-model" autoFocus required maxLength={150} value={form.model} onChange={(event) => change('model', event.target.value)} placeholder="Ej. iPhone 13" /></div>
        <div><Label htmlFor="dv-storage">Capacidad (opcional)</Label><Input id="dv-storage" maxLength={60} value={form.storage} onChange={(event) => change('storage', event.target.value)} placeholder="Ej. 128GB" /></div>
        <div><Label htmlFor="dv-condition">Condición</Label><Select id="dv-condition" value={form.condition} onChange={(event) => change('condition', event.target.value)}>{Object.entries(CONDICIONES_VALUACION).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div>
        <div><Label htmlFor="dv-base">Valor base (Gs)</Label><MoneyInput id="dv-base" required value={form.baseValuePyg} onValueChange={(value) => change('baseValuePyg', value)} placeholder="0" /></div>
        <div><Label htmlFor="dv-max">Valor máximo (Gs, opcional)</Label><MoneyInput id="dv-max" value={form.maxValuePyg} onValueChange={(value) => change('maxValuePyg', value)} placeholder="Hasta" /></div>
        <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={form.isActive} onChange={(event) => change('isActive', event.target.checked)} />Valor activo</label>
        <div className="sm:col-span-2"><Label htmlFor="dv-notes">Notas (opcional)</Label><Textarea id="dv-notes" rows={2} maxLength={2000} value={form.notes} onChange={(event) => change('notes', event.target.value)} placeholder="Aclaraciones para el equipo" /></div>
      </fieldset>
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar valor'}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => { setForm(null); setEditingId(null); setError('') }}>Cancelar</Button></div>
    </form>}
    {!loading && !error && !visibles.length && <p className="text-sm text-mute">{rows.length ? 'Ningún valor coincide con la búsqueda.' : 'Todavía no hay valores cargados. Sin un valor cargado, el POS no sugiere nada.'}</p>}
    {visibles.length > 0 && <div className="overflow-x-auto" data-testid="valoraciones-tabla">
      <div className={cn(GRID_VALORACIONES, 'px-3.5 pb-2 pt-1')}>
        <span className={CELDA_VALORACIONES}>Modelo</span>
        <span className={CELDA_VALORACIONES}>Capacidad</span>
        <span className={CELDA_VALORACIONES}>Condición</span>
        <span className={cn(CELDA_VALORACIONES, 'text-right')}>Valor base</span>
        <span className={cn(CELDA_VALORACIONES, 'text-right')}>Máximo</span>
        <span className={CELDA_VALORACIONES}>Estado</span>
        <span className={cn(CELDA_VALORACIONES, 'text-right')}>Acciones</span>
      </div>
      <div className="space-y-1">{visibles.map(row => <div key={row.id} data-testid="valoracion-fila" className={cn(GRID_VALORACIONES, 'rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2 transition hover:border-fono/40')}>
        <span className="min-w-0 truncate text-[13px] font-semibold" title={row.model}>{row.model}</span>
        <span className="truncate text-xs text-mute">{row.storage || '—'}</span>
        <span><Badge color={row.condition === 'NEW' ? 'green' : row.condition === 'USED' ? 'orange' : 'slate'} className="w-fit whitespace-nowrap px-1.5 py-0.5 text-[10px]">{CONDICIONES_VALUACION[row.condition] || row.condition}</Badge></span>
        <span className="truncate text-right text-xs tabular-nums text-fore">{gs(row.baseValuePyg)}</span>
        <span className="truncate text-right text-xs tabular-nums text-mute">{row.maxValuePyg != null ? gs(row.maxValuePyg) : '—'}</span>
        <span className="truncate text-xs text-mute">{row.isActive ? 'Activo' : 'Inactivo'}</span>
        <span className="flex items-center justify-end gap-1.5">
          <Button type="button" variant="outline" className="h-8 px-2 text-xs" disabled={busy || !!form} aria-label={`Editar ${row.model}`} onClick={() => openForm(row)}>Editar</Button>
          <Button type="button" variant="ghost" className="h-8 px-2 text-xs" disabled={busy || !!form} aria-label={`${row.isActive ? 'Desactivar' : 'Activar'} ${row.model}`} onClick={() => alternar(row)}>{row.isActive ? 'Desactivar' : 'Activar'}</Button>
        </span>
      </div>)}</div>
    </div>}
  </Card>
}

export default function TradeInPipeline() {
  const { esDemo, puede } = useSesion()
  const admin = puede('tradeins:manage')
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const [abierto, setAbierto] = useState(null)
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
    const gen = generation
    setItems([])
    load()
    const refresh = () => { load() }
    if (esDemo) { window.addEventListener('mobos:trade-ins-updated', refresh); window.addEventListener('storage', refresh) }
    return () => { gen.current++; window.removeEventListener('mobos:trade-ins-updated', refresh); window.removeEventListener('storage', refresh) }
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
    {visible.length > 0 && <div className="overflow-x-auto" data-testid="tradein-tabla">
      <div className={cn(GRID_TRADEIN, 'px-3.5 pb-2 pt-1')}>
        <span className={CELDA_TRADEIN}>Equipo</span>
        <span className={CELDA_TRADEIN}>Cliente</span>
        <span className={CELDA_TRADEIN}>Estado</span>
        <span className={CELDA_TRADEIN}>Toma</span>
        <span className={CELDA_TRADEIN}>Reparación</span>
        <span className={CELDA_TRADEIN}>Invertido</span>
        <span className={CELDA_TRADEIN}>Publicado</span>
        <span className={CELDA_TRADEIN}>Ingresó</span>
        <span />
      </div>
      <div className="space-y-1">{visible.map((item) => <div key={`${item.id}:${item.status}:${item.updatedAt || ''}`}>
        <FilaDevice item={item} abierto={abierto === item.id} onClick={() => setAbierto(current => current === item.id ? null : item.id)} />
        {abierto === item.id && <div className="mt-1"><Device item={item} busy={busy || uncertain} onSave={save} /></div>}
      </div>)}</div>
    </div>}
    <Valuaciones esDemo={esDemo} />
  </div>
}
