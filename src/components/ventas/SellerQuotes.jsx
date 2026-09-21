import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import { copiarAlPortapapeles } from '@/utils/portapapeles'
import { getProductos } from '@/lib/storage'
import { gs, num } from '@/utils/calculos'
import { codigoPedido } from '@/utils/pedido'
import { Aviso, Badge, Button, Input, Modal, MoneyInput, Textarea } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import SearchField from '@/components/shared/SearchField'
import QRCode from 'qrcode'
import ProductCombobox from '@/components/shared/ProductCombobox'
import Cronologia from '@/components/shared/Cronologia'
import { printProformaReceipt, printQuoteReceipt, quoteUrlFor } from '@/components/shared/OrderReceipt'
import { configImpresora } from '@/lib/printing/agent'
import { imprimirDocumentoNoFiscal } from '@/lib/printing/documentos'
import { ticketProforma } from '@/lib/printing/tickets'
import { cn } from '@/lib/utils'
import { resources } from '@/lib/api'
import { useBusquedaDiferida } from '@/hooks/useBusquedaDiferida'
import { internationalPhone } from '@/utils/telefono'
import { SellerFeedback, SellerSection, useSellerData } from './SellerData'
import { CELDA_ENCABEZADO, ROTULO_DATO } from '@/components/shared/tabla'
const STATUS = { DRAFT: ['Borrador', 'slate'], SENT: ['Enviada', 'blue'], ACCEPTED: ['Aceptada', 'orange'], REJECTED: ['Rechazada', 'red'], CONVERTED: ['Convertida', 'green'], EXPIRED: ['Vencida', 'red'], CANCELLED: ['Cancelada', 'slate'] }
// Chips de estado resueltos en el servidor (mismo patrón que Pedidos).
const ABIERTAS = ['DRAFT', 'SENT', 'ACCEPTED']
const FILTROS = [['todas', 'Todas'], ['abiertas', 'Abiertas'], ['DRAFT', 'Borrador'], ['SENT', 'Enviada'], ['ACCEPTED', 'Aceptada'], ['REJECTED', 'Rechazada'], ['CONVERTED', 'Convertida']]
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
  const [filtro, setFiltro] = useState('todas')
  // La búsqueda global abre el listado con ?q= aplicado.
  const [searchParams] = useSearchParams()
  const qParam = searchParams.get('q') || ''
  const [query, setQuery] = useState(qParam)
  useEffect(() => { if (qParam) setQuery(qParam) }, [qParam])
  // Búsqueda y estado van al servidor (cubren todas las cotizaciones del
  // alcance del usuario, no solo la página cargada). El texto se difiere 250 ms.
  const busqueda = useBusquedaDiferida(query)
  const path = useMemo(() => {
    const params = new URLSearchParams()
    const texto = busqueda.trim()
    if (texto) params.set('q', texto)
    if (filtro !== 'todas') params.set('status', filtro)
    const consulta = params.toString()
    return `/api/quotes${consulta ? `?${consulta}` : ''}`
  }, [filtro, busqueda])
  const data = useSellerData(path, identity, demoQuotes, esDemo, { limit: 50 })
  const [crearOpen, setCrearOpen] = useState(false)
  const [historial, setHistorial] = useState(null)
  const [enlace, setEnlace] = useState(null)
  const [qr, setQr] = useState('')
  const [enlaceBusy, setEnlaceBusy] = useState(false)
  const [enlaceError, setEnlaceError] = useState('')
  const enlaceSeq = useRef(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({ customerName: '', customerId: '', validUntil: '', notes: '', discountPyg: '' })
  const [clientes, setClientes] = useState([])
  const clienteTimer = useRef(null)
  const [items, setItems] = useState([emptyItem()])

  // La demo no pagina contra la API: sus pocas filas se filtran en memoria.
  const rows = useMemo(() => esDemo ? data.rows
    .filter(row => filtro === 'todas' || (filtro === 'abiertas' ? ABIERTAS.includes(row.status) : row.status === filtro))
    .filter(row => `${row.number} ${row.customerName}`.toLowerCase().includes(query.toLowerCase())) : data.rows, [data.rows, filtro, query, esDemo])
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

  // Enlace/QR del cliente: el vendedor lo comparte y el cliente acepta o
  // rechaza desde su teléfono; regenerar invalida el enlace anterior.
  async function abrirEnlace(row) {
    const seq = ++enlaceSeq.current
    setEnlace({ ...row, publicToken: row.publicToken || '' }); setQr(''); setEnlaceError(''); setEnlaceBusy(true)
    try {
      const data = await resources.quotes.accessToken(row.id)
      if (seq !== enlaceSeq.current) return
      const token = data?.token || ''
      if (!token) throw new Error('No se pudo preparar el enlace.')
      setEnlace(current => current && current.id === row.id ? { ...current, publicToken: token } : current)
      const url = quoteUrlFor(token)
      if (url) setQr(await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 220 }))
    } catch (cause) {
      if (seq === enlaceSeq.current) setEnlaceError(cause?.message || 'No se pudo preparar el enlace.')
    } finally { if (seq === enlaceSeq.current) setEnlaceBusy(false) }
  }
  async function regenerarEnlace() {
    if (!enlace || enlaceBusy) return
    const seq = ++enlaceSeq.current
    setEnlaceBusy(true); setEnlaceError('')
    try {
      const data = await resources.quotes.accessToken(enlace.id, true)
      if (seq !== enlaceSeq.current) return
      const token = data?.token || ''
      if (!token) throw new Error('No se pudo regenerar el enlace.')
      setEnlace(current => current ? { ...current, publicToken: token } : current)
      const url = quoteUrlFor(token)
      if (url) setQr(await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 220 }))
      setNotice('Enlace regenerado: el anterior dejó de funcionar.')
    } catch (cause) {
      if (seq === enlaceSeq.current) setEnlaceError(cause?.message || 'No se pudo regenerar el enlace.')
    } finally { if (seq === enlaceSeq.current) setEnlaceBusy(false) }
  }
  async function copiarEnlace() {
    const url = quoteUrlFor(enlace?.publicToken)
    if (!url) return
    if (await copiarAlPortapapeles(url)) setNotice('Enlace copiado al portapapeles.'); else setEnlaceError('No se pudo copiar el enlace.')
  }
  async function imprimirEnlace() {
    if (!enlace) return
    try { await printQuoteReceipt(enlace, { format: 'a4', token: enlace.publicToken }) } catch { setEnlaceError('No se pudo preparar la impresión.') }
  }
  // Proforma / presupuesto: térmica por el agente o el puente y, solo si el
  // fallo fue claro, el A4 por el diálogo. Nunca tras encolar o un resultado
  // incierto (el reintento podría duplicar el papel).
  async function imprimirProforma() {
    if (!enlace) return
    setEnlaceError('')
    const { ancho } = configImpresora()
    const resultado = await imprimirDocumentoNoFiscal(ticketProforma(enlace, { ancho }), {
      tipo: 'proforma',
      respaldo: () => printProformaReceipt(enlace, { format: 'a4' }),
    })
    if (resultado.ok) {
      setNotice(resultado.encolado ? (resultado.remoto ? 'Proforma encolada: la imprime el puente cuando la reclame.' : 'Proforma encolada: la impresora no respondió y se reintenta sola.') : 'Proforma enviada a la impresora.')
      return
    }
    if (!resultado.dialogo) setEnlaceError(resultado.error || 'No se pudo imprimir la proforma.')
  }

  return <SellerSection description="Pipeline de ventas: cotizá, seguí el vencimiento y convertí en pedido cuando el cliente acepte.">
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1">{FILTROS.map(([key, label]) => <button key={key} type="button" onClick={() => setFiltro(key)} className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold transition', filtro === key ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore')}>{label}</button>)}</div>
      <div className="min-w-[200px] flex-1"><SearchField ariaLabel="Buscar cotizaciones" placeholder="Número, cliente o ítem" value={query} onChange={event => setQuery(event.target.value)} /></div>
      {!esDemo && <Button type="button" onClick={() => { setCrearOpen(true); setError(''); setNotice('') }}>+ Nueva cotización</Button>}
      <button type="button" onClick={data.refresh} disabled={data.loading} className="rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore">Actualizar</button>
    </div>
    {notice && <Aviso tono="ok">{notice}</Aviso>}
    {error && <Aviso tono="error">{error}</Aviso>}
    <SellerFeedback {...data} empty={!rows.length} />
    {!data.loading && !data.error && <div className="overflow-x-auto" data-testid="cotizaciones-tabla">
      <div className={cn(GRID, 'px-3.5 pb-2 pt-1')}>
        <span className={CELDA_ENCABEZADO}>Número</span>
        <span className={CELDA_ENCABEZADO}>Cliente</span>
        <span className={CELDA_ENCABEZADO}>Artículos</span>
        <span className={CELDA_ENCABEZADO}>Vence</span>
        <span className={CELDA_ENCABEZADO}>Estado</span>
        <span className={cn('truncate text-right', ROTULO_DATO)}>Total</span>
        <span className={cn('truncate text-right', ROTULO_DATO)}>Acciones</span>
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
              {!esDemo && <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => abrirEnlace(row)}>Enlace/QR</Button>}
              {!esDemo && <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setHistorial(row)}>Historial</Button>}
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
          <p className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-mute">Ítems</p>
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
    <Modal open={historial !== null} onClose={() => setHistorial(null)} title={`Historial de ${historial?.number || 'cotización'}`}>
      {historial && <Cronologia endpoint={`/api/quotes/${historial.id}/history`} active={historial !== null} vacio="Sin actividad" descripcionVacio="Los cambios de estado, la conversión en pedido y las notas de esta cotización aparecerán acá." />}
    </Modal>
    <Modal open={enlace !== null} onClose={() => { setEnlace(null); setQr(''); setEnlaceError('') }} title={`Enlace de ${enlace?.number || 'la cotización'}`}>
      <div className="space-y-4 text-center">
        <p className="text-sm text-mute">Compartí este enlace o QR con el cliente: puede aceptar o rechazar la cotización desde su teléfono, sin instalar nada.</p>
        {enlaceBusy && !qr
          ? <p className="py-10 text-sm text-mute">Preparando enlace…</p>
          : qr
            ? <img src={qr} alt="QR de la cotización" className="mx-auto h-44 w-44 rounded-xl bg-white p-2" />
            : null}
        <p className="break-all rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-[11px] text-mute">{quoteUrlFor(enlace?.publicToken) || '—'}</p>
        {enlaceError && <Aviso tono="error">{enlaceError}</Aviso>}
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" variant="outline" disabled={!enlace?.publicToken} onClick={copiarEnlace}><Icon name="copy" className="h-4 w-4" />Copiar enlace</Button>
          <Button type="button" variant="outline" disabled={enlaceBusy || !enlace} onClick={regenerarEnlace}><Icon name="refresh" className="h-4 w-4" />Regenerar</Button>
          <Button type="button" disabled={enlaceBusy || !enlace} onClick={imprimirEnlace}><Icon name="printer" className="h-4 w-4" />Imprimir</Button>
          <Button type="button" variant="outline" disabled={enlaceBusy || !enlace} onClick={imprimirProforma}><Icon name="printer" className="h-4 w-4" />Proforma</Button>
        </div>
      </div>
    </Modal>
  </SellerSection>
}
