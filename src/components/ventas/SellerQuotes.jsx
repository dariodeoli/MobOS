import { useMemo, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { getProductos } from '@/lib/storage'
import { gs, num } from '@/utils/calculos'
import { Badge, Button, Input, Label, Modal, MoneyInput, Textarea } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import ProductCombobox from '@/components/shared/ProductCombobox'
import { cn } from '@/lib/utils'
import { resources } from '@/lib/api'
import { SellerFeedback, SellerSection, useSellerData } from './SellerData'

const STATUS = { DRAFT: ['Borrador', 'slate'], SENT: ['Enviada', 'blue'], ACCEPTED: ['Aceptada', 'orange'], CONVERTED: ['Convertida', 'green'], EXPIRED: ['Vencida', 'red'], CANCELLED: ['Cancelada', 'slate'] }
const FILTROS = [['todas', 'Todas'], ['abiertas', 'Abiertas'], ['convertidas', 'Convertidas']]
const identity = row => row
const demoQuotes = () => []
const emptyItem = (product = null) => ({ productId: product?.id || '', description: product?.nombre || '', quantity: '1', unitPricePyg: product && product.precioVenta > 0 ? String(product.precioVenta) : '' })

// Pipeline de ventas: cotizaciones con vencimiento que se convierten en pedido.
export default function SellerQuotes() {
  const { esDemo } = useSesion()
  const productos = getProductos().filter(product => product.activo !== false)
  const data = useSellerData('/api/quotes', identity, demoQuotes, esDemo, { limit: 50 })
  const [filtro, setFiltro] = useState('todas')
  const [query, setQuery] = useState('')
  const [crearOpen, setCrearOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({ customerName: '', validUntil: '', notes: '', discountPyg: '' })
  const [items, setItems] = useState([emptyItem()])

  const rows = useMemo(() => data.rows
    .filter(row => filtro === 'convertidas' ? row.status === 'CONVERTED' : filtro === 'abiertas' ? ['DRAFT', 'SENT', 'ACCEPTED'].includes(row.status) : true)
    .filter(row => `${row.number} ${row.customerName} ${row.customer?.name || ''}`.toLowerCase().includes(query.toLowerCase())), [data.rows, filtro, query])
  const itemsValidos = items.filter(item => item.description.trim() && num(item.quantity) > 0 && num(item.unitPricePyg) >= 0)
  const total = itemsValidos.reduce((sum, item) => sum + num(item.quantity) * num(item.unitPricePyg), 0) - num(form.discountPyg)

  async function accion(operacion, exito) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await operacion(); setNotice(exito); await data.refresh() } catch (cause) { setError(cause?.message || 'No se pudo completar la acción.') } finally { setBusy(false) }
  }
  async function crear(event) {
    event.preventDefault()
    if (!form.customerName.trim() || !itemsValidos.length) { setError('Indicá el cliente y al menos un ítem válido.'); return }
    await accion(async () => {
      await resources.quotes.create({
        customerName: form.customerName.trim(),
        validUntil: form.validUntil || undefined,
        notes: form.notes.trim() || undefined,
        discountPyg: num(form.discountPyg),
        items: itemsValidos.map(item => ({ ...(item.productId ? { productId: item.productId } : {}), description: item.description.trim(), quantity: num(item.quantity), unitPricePyg: num(item.unitPricePyg) })),
      })
      setForm({ customerName: '', validUntil: '', notes: '', discountPyg: '' }); setItems([emptyItem()]); setCrearOpen(false)
    }, 'Cotización creada. Podés enviarla y convertirla en pedido cuando el cliente acepte.')
  }
  const convertir = row => accion(async () => { const order = await resources.quotes.convert(row.id); setNotice(`Cotización ${row.number} convertida en el pedido ${order.orderNumber} (queda pendiente de cobro en Pedidos).`) }, 'Conversión completada.')

  return <SellerSection title="Cotizaciones" description="Pipeline de ventas: cotizá, seguí el vencimiento y convertí en pedido cuando el cliente acepte.">
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1">{FILTROS.map(([key, label]) => <button key={key} type="button" onClick={() => setFiltro(key)} className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold transition', filtro === key ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore')}>{label}</button>)}</div>
      <div className="min-w-[200px] flex-1"><Input aria-label="Buscar cotizaciones" placeholder="Número o cliente" value={query} onChange={event => setQuery(event.target.value)} /></div>
      {!esDemo && <Button type="button" onClick={() => { setCrearOpen(true); setError(''); setNotice('') }}>+ Nueva cotización</Button>}
      <button type="button" onClick={data.refresh} disabled={data.loading} className="rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore">Actualizar</button>
    </div>
    {notice && <p role="status" className="rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">{notice}</p>}
    {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
    <SellerFeedback {...data} empty={!rows.length} />
    {!data.loading && !data.error && <div className="space-y-1.5">{rows.map(row => {
      const [label, tone] = STATUS[row.status] || [row.status, 'slate']
      const vence = row.validUntil ? new Date(row.validUntil) : null
      const dias = vence ? Math.ceil((vence.getTime() - Date.now()) / 86400000) : null
      return <article key={row.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-600 px-3.5 py-2.5 transition hover:border-fono/40">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2"><b className="font-mono text-xs font-bold text-fono-light">{row.number}</b><span className="truncate text-sm font-semibold">{row.customerName || row.customer?.name}</span><Badge color={tone}>{label}</Badge>{vence && <span className={cn('text-[11px]', dias !== null && dias <= 2 && ['DRAFT', 'SENT', 'ACCEPTED'].includes(row.status) ? 'font-semibold text-warn' : 'text-mute')}>{dias === null ? '' : dias < 0 ? 'venció' : `vence en ${dias} día${dias === 1 ? '' : 's'}`}</span>}</span>
          <span className="mt-0.5 block truncate text-[11px] text-mute">{(row.items || []).map(item => `${item.quantity} × ${item.description}`).join(' · ')}{row.seller?.name ? ` · ${row.seller.name}` : ''}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <b className="text-sm tabular-nums">{gs(row.totalPyg)}</b>
          {!esDemo && ['DRAFT', 'SENT', 'ACCEPTED'].includes(row.status) && <>
            {row.status === 'DRAFT' && <Button type="button" variant="outline" className="h-8 px-2 text-xs" disabled={busy} onClick={() => accion(() => resources.quotes.update({ id: row.id, status: 'SENT' }), 'Cotización marcada como enviada.')}>Enviar</Button>}
            {row.status === 'SENT' && <Button type="button" variant="outline" className="h-8 px-2 text-xs" disabled={busy} onClick={() => accion(() => resources.quotes.update({ id: row.id, status: 'ACCEPTED' }), 'Cotización aceptada.')}>Aceptar</Button>}
            {row.status === 'ACCEPTED' && <Button type="button" className="h-8 px-2 text-xs" disabled={busy} onClick={() => convertir(row)}>Convertir en pedido</Button>}
            <button type="button" disabled={busy} className="h-8 rounded-lg border border-bad/30 px-2 text-xs font-semibold text-bad transition hover:bg-bad/10" onClick={() => accion(() => resources.quotes.update({ id: row.id, status: 'CANCELLED' }), 'Cotización cancelada.')}>Cancelar</button>
          </>}
          {row.order && <span className="text-[11px] text-mute">Pedido {row.order.orderNumber}</span>}
        </span>
      </article>
    })}</div>}
    {!data.loading && !data.error && data.hayMas && <div className="flex justify-center pt-1"><button type="button" disabled={data.cargandoMas} onClick={data.cargarMas} className="rounded-lg border border-ink-500 px-4 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore disabled:opacity-60">{data.cargandoMas ? 'Cargando…' : 'Cargar más cotizaciones'}</button></div>}
    <Modal open={crearOpen} onClose={() => !busy && setCrearOpen(false)} title="Nueva cotización" className="max-w-2xl">
      <form onSubmit={crear} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5 text-xs text-mute">Cliente<Input required maxLength={200} value={form.customerName} onChange={event => setForm(current => ({ ...current, customerName: event.target.value }))} placeholder="Nombre o empresa" /></label>
          <label className="block space-y-1.5 text-xs text-mute">Válida hasta<Input type="date" value={form.validUntil} onChange={event => setForm(current => ({ ...current, validUntil: event.target.value }))} /></label>
        </div>
        <div className="space-y-2">
          <Label>Ítems</Label>
          {items.map((item, index) => <div key={index} className="grid gap-2 rounded-xl border border-ink-600 p-2.5 sm:grid-cols-[1.3fr_70px_140px_auto]">
            <span className="flex items-center gap-1">
              <ProductCombobox key={item.productId || 'vacio'} className="flex-1" products={productos} selectedId={item.productId} onSelect={producto => setItems(list => list.map((row, i) => i === index ? emptyItem(producto) : row))} placeholder="Producto del catálogo (opcional)" />
              {item.productId && <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-mute transition hover:bg-bad/10 hover:text-bad" aria-label="Quitar producto del ítem" onClick={() => setItems(list => list.map((row, i) => i === index ? emptyItem() : row))}><Icon name="trash" className="h-4 w-4" /></button>}
            </span>
            <Input inputMode="numeric" value={item.quantity} onChange={event => setItems(list => list.map((row, i) => i === index ? { ...row, quantity: event.target.value.replace(/\D/g, '') } : row))} placeholder="Cant." />
            <MoneyInput value={item.unitPricePyg} onValueChange={value => setItems(list => list.map((row, i) => i === index ? { ...row, unitPricePyg: value === '' ? '' : String(value) } : row))} placeholder="Precio unitario" />
            <button type="button" className="grid h-11 w-11 place-items-center rounded-lg text-mute transition hover:bg-bad/10 hover:text-bad" onClick={() => setItems(list => list.length > 1 ? list.filter((_, i) => i !== index) : list)} aria-label="Quitar ítem"><Icon name="trash" className="h-4 w-4" /></button>
            {!item.productId && <div className="sm:col-span-4"><Input maxLength={300} value={item.description} onChange={event => setItems(list => list.map((row, i) => i === index ? { ...row, description: event.target.value } : row))} placeholder="Descripción del ítem" /></div>}
          </div>)}
          <Button type="button" variant="outline" onClick={() => setItems(list => [...list, emptyItem()])}>+ Agregar ítem</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5 text-xs text-mute">Descuento (Gs)<MoneyInput value={form.discountPyg} onValueChange={value => setForm(current => ({ ...current, discountPyg: value === '' ? '' : String(value) }))} placeholder="0" /></label>
          <div className="rounded-xl border border-ink-600 bg-ink-800/60 px-3 py-2 text-sm">Total: <b className="tabular-nums text-fono-light">{gs(Math.max(0, total))}</b></div>
        </div>
        <label className="block space-y-1.5 text-xs text-mute">Notas<Textarea rows={2} maxLength={2000} value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} placeholder="Condiciones, validez, observaciones…" /></label>
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={() => setCrearOpen(false)}>Cancelar</Button><Button type="submit" disabled={busy || !form.customerName.trim() || !itemsValidos.length}>{busy ? 'Guardando…' : 'Crear cotización'}</Button></div>
      </form>
    </Modal>
  </SellerSection>
}
