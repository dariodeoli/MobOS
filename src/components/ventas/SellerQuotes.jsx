import { useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { getProductos } from '@/lib/storage'
import { gs, num } from '@/utils/calculos'
import { codigoPedido } from '@/utils/pedido'
import { Badge, Button, Input, Label, Modal, MoneyInput, Textarea } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import ProductCombobox from '@/components/shared/ProductCombobox'
import { cn } from '@/lib/utils'
import { resources } from '@/lib/api'
import { internationalPhone } from '@/utils/telefono'
import { SellerFeedback, SellerSection, useSellerData } from './SellerData'

const STATUS = { DRAFT: ['Borrador', 'slate'], SENT: ['Enviada', 'blue'], ACCEPTED: ['Aceptada', 'orange'], CONVERTED: ['Convertida', 'green'], EXPIRED: ['Vencida', 'red'], CANCELLED: ['Cancelada', 'slate'] }
const ABIERTAS = ['DRAFT', 'SENT', 'ACCEPTED']
const FILTROS = [['todas', 'Todas'], ['abiertas', 'Abiertas'], ['convertidas', 'Convertidas']]
const identity = row => row
const demoQuotes = () => []
const emptyItem = (product = null) => ({ productId: product?.id || '', description: product?.nombre || '', quantity: '1', unitPricePyg: product && product.precioVenta > 0 ? String(product.precioVenta) : '' })

// Tabla compacta: una fila por cotización, encabezados ordenables y las
// acciones del estado en la misma línea. Misma grilla que Pedidos y Clientes.
const GRID = 'grid min-w-[55rem] grid-cols-[5.5rem_minmax(7rem,1fr)_minmax(8rem,1.3fr)_6.5rem_6rem_7.5rem_10rem] items-center gap-x-2'
const fechaCorta = (value) => {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }).replace('.', '')
}
// Vencimiento relativo: es lo que se mira para apurar la venta. La fecha exacta
// queda en el title.
const vencimiento = (row) => {
  const vence = row.validUntil ? new Date(row.validUntil) : null
  if (!vence || Number.isNaN(vence.getTime())) return { texto: '—', urgente: false, titulo: 'Sin vencimiento' }
  const dias = Math.ceil((vence.getTime() - Date.now()) / 86400000)
  const titulo = `Vence el ${vence.toLocaleDateString('es-PY')}`
  if (!ABIERTAS.includes(row.status)) return { texto: fechaCorta(row.validUntil), urgente: false, titulo }
  if (dias < 0) return { texto: 'venció', urgente: true, titulo }
  return { texto: `en ${dias} día${dias === 1 ? '' : 's'}`, urgente: dias <= 2, titulo }
}

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
  const [form, setForm] = useState({ customerName: '', customerId: '', validUntil: '', notes: '', discountPyg: '' })
  const [clientes, setClientes] = useState([])
  const clienteTimer = useRef(null)
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
  // Elegir un cliente existente deja la cotización ligada a su ficha: al
  // convertirla en pedido el cliente viaja con ella. El texto libre sigue
  // sirviendo para cotizar a alguien que todavía no es cliente.
  function buscarCliente(texto) {
    setForm(current => ({ ...current, customerName: texto, customerId: '' }))
    if (clienteTimer.current) clearTimeout(clienteTimer.current)
    clienteTimer.current = setTimeout(async () => {
      const q = texto.trim()
      if (q.length < 2) { setClientes([]); return }
      try { setClientes((await resources.customers.list(q)) || []) } catch { setClientes([]) }
    }, 250)
  }
  useEffect(() => () => { if (clienteTimer.current) clearTimeout(clienteTimer.current) }, [])

  async function crear(event) {
    event.preventDefault()
    if (!form.customerName.trim() || !itemsValidos.length) { setError('Indicá el cliente y al menos un ítem válido.'); return }
    await accion(async () => {
      await resources.quotes.create({
        customerName: form.customerName.trim(),
        ...(form.customerId ? { customerId: form.customerId } : {}),
        validUntil: form.validUntil || undefined,
        notes: form.notes.trim() || undefined,
        discountPyg: num(form.discountPyg),
        items: itemsValidos.map(item => ({ ...(item.productId ? { productId: item.productId } : {}), description: item.description.trim(), quantity: num(item.quantity), unitPricePyg: num(item.unitPricePyg) })),
      })
      setForm({ customerName: '', customerId: '', validUntil: '', notes: '', discountPyg: '' }); setClientes([]); setItems([emptyItem()]); setCrearOpen(false)
    }, 'Cotización creada. Podés enviarla y convertirla en pedido cuando el cliente acepte.')
  }
  const convertir = row => accion(async () => { const order = await resources.quotes.convert(row.id); setNotice(`Cotización ${row.number} convertida en el pedido ${codigoPedido(order.orderNumber)} (queda pendiente de cobro en Pedidos).`) }, 'Conversión completada.')

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
    {!data.loading && !data.error && <div className="overflow-x-auto" data-testid="cotizaciones-tabla">
      <div className={cn(GRID, 'px-3.5 pb-2 pt-1')}>
        <span className="truncate text-[10px] font-bold uppercase tracking-wider text-mute">Número</span>
        <span className="truncate text-[10px] font-bold uppercase tracking-wider text-mute">Cliente</span>
        <span className="truncate text-[10px] font-bold uppercase tracking-wider text-mute">Artículos</span>
        <span className="truncate text-[10px] font-bold uppercase tracking-wider text-mute">Vence</span>
        <span className="truncate text-[10px] font-bold uppercase tracking-wider text-mute">Estado</span>
        <span className="truncate text-right text-[10px] font-bold uppercase tracking-wider text-mute">Total</span>
        <span className="truncate text-right text-[10px] font-bold uppercase tracking-wider text-mute">Acciones</span>
      </div>
      <div className="space-y-1">
        {rows.map(row => {
          const [label, tone] = STATUS[row.status] || [row.status, 'slate']
          const cliente = row.customerName || row.customer?.name || 'Sin cliente'
          const articulos = (row.items || []).map(item => `${item.quantity} × ${item.description}`).join(' · ')
          const vence = vencimiento(row)
          const abierta = !esDemo && ABIERTAS.includes(row.status)
          return <div key={row.id} data-testid="cotizacion-fila" className={cn(GRID, 'rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2 transition hover:border-fono/40')}>
            <span className="truncate font-mono text-xs font-bold text-fono-light" title={row.number}>{row.number}</span>
            <span className="truncate text-sm font-semibold" title={cliente}>{cliente}</span>
            <span className="truncate text-[11px] text-mute" title={articulos || undefined}>{articulos || '—'}</span>
            <span className={cn('truncate text-[11px]', vence.urgente ? 'font-semibold text-warn' : 'text-mute')} title={vence.titulo}>{vence.texto}</span>
            <Badge color={tone} className="w-fit justify-self-start whitespace-nowrap px-1.5 py-0.5 text-[10px]">{label}</Badge>
            <span className="truncate text-right text-sm font-bold tabular-nums text-fore">{gs(row.totalPyg)}</span>
            <span className="flex flex-wrap items-center justify-end gap-1">
              {row.order && <span className="truncate text-[11px] text-mute" title={`Pedido ${codigoPedido(row.order.orderNumber)}`}>Pedido {codigoPedido(row.order.orderNumber)}</span>}
              {abierta && <>
                {row.status === 'DRAFT' && <Button type="button" variant="outline" className="h-8 px-2 text-xs" disabled={busy} onClick={() => accion(() => resources.quotes.update({ id: row.id, status: 'SENT' }), 'Cotización marcada como enviada.')}>Enviar</Button>}
                {row.status === 'SENT' && <Button type="button" variant="outline" className="h-8 px-2 text-xs" disabled={busy} onClick={() => accion(() => resources.quotes.update({ id: row.id, status: 'ACCEPTED' }), 'Cotización aceptada.')}>Aceptar</Button>}
                {row.status === 'ACCEPTED' && <Button type="button" className="h-8 px-2 text-xs" title="Convertir en pedido" disabled={busy} onClick={() => convertir(row)}>Convertir</Button>}
                <button type="button" disabled={busy} className="h-8 rounded-lg border border-bad/30 px-2 text-xs font-semibold text-bad transition hover:bg-bad/10" onClick={() => accion(() => resources.quotes.update({ id: row.id, status: 'CANCELLED' }), 'Cotización cancelada.')}>Cancelar</button>
              </>}
            </span>
          </div>
        })}
      </div>
    </div>}
    {!data.loading && !data.error && data.hayMas && <div className="flex justify-center pt-1"><button type="button" disabled={data.cargandoMas} onClick={data.cargarMas} className="rounded-lg border border-ink-500 px-4 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore disabled:opacity-60">{data.cargandoMas ? 'Cargando…' : 'Cargar más cotizaciones'}</button></div>}
    <Modal open={crearOpen} onClose={() => !busy && setCrearOpen(false)} title="Nueva cotización" className="max-w-2xl">
      <form onSubmit={crear} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5 text-xs text-mute">Cliente
            <div className="relative">
              <Input required maxLength={200} autoComplete="off" value={form.customerName} onChange={event => buscarCliente(event.target.value)} placeholder="Nombre o empresa" />
              {form.customerId && <span className="mt-1 block text-[11px] text-fono-light">Cliente de la ficha: la cotización queda ligada a su perfil.</span>}
              {!form.customerId && clientes.length > 0 && <ul className="absolute z-10 mt-1 max-h-44 w-full overflow-auto rounded-xl border border-ink-500 bg-ink-800 shadow-xl">{clientes.slice(0, 6).map(cliente => <li key={cliente.id}><button type="button" className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-ink-700" onClick={() => { setForm(current => ({ ...current, customerId: cliente.id, customerName: cliente.name })); setClientes([]) }}><span className="min-w-0 truncate font-medium text-fore">{cliente.name}</span><span className="shrink-0 text-xs text-mute">{[cliente.phone ? `+${internationalPhone(cliente.phone, cliente.countryCode)}` : '', cliente.document ? `CI/RUC ${cliente.document}` : ''].filter(Boolean).join(' · ')}</span></button></li>)}</ul>}
            </div>
          </label>
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
