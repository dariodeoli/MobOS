import { useMemo, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { listVentas, productosById } from '@/lib/storage'
import { gs } from '@/utils/calculos'
import { Input } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'
import { SellerFeedback, SellerSection, useSellerData } from './SellerData'
import PedidoDetalle from './PedidoDetalle'

export const orderFields = (row) => ({
  id: row.id, sellerId: row.sellerId ?? row.vendedorId,
  number: row.orderNumber || row.codigo || row.id,
  customer: row.customer?.name || row.cliente || 'Sin cliente',
  customerId: row.customerId || row.clienteId || null,
  date: row.createdAt || row.creadoEn || row.fecha,
  status: row.status || 'REGISTERED', paymentStatus: row.estadoPago || (Array.isArray(row.payments) ? (() => {
    const paid = row.payments.filter(p => p.status === 'CONFIRMED').reduce((sum, p) => sum + Number(p.amountPyg || 0), 0)
    return paid >= row.totalPyg ? 'Pagado' : paid > 0 ? 'Parcial' : 'Pendiente'
  })() : ''),
  total: row.totalPyg ?? row.total ?? row.precio, productId: row.productoId,
  products: Array.isArray(row.items) ? row.items.map((item) => item.description).filter(Boolean).join(', ') : row.productoNombre || '',
  fulfillmentStatus: row.fulfillmentStatus || row.entrega || 'PROCESSING', deliveryType: row.deliveryType, publicToken: row.publicToken,
  items: row.items || [], payments: row.payments || row.pagos || [], subtotalPyg: row.subtotalPyg, discountPyg: row.discountPyg, deliveryPyg: row.deliveryPyg,
  tags: Array.isArray(row.tags) ? row.tags : [], archivedAt: row.archivedAt || null,
})
const FULFILLMENT = { PROCESSING: 'Preparando', IN_TRANSIT: 'En camino', READY_FOR_PICKUP: 'Listo para retirar', DELIVERED: 'Entregado' }
const FULFILLMENT_TONE = { PROCESSING: 'slate', IN_TRANSIT: 'blue', READY_FOR_PICKUP: 'orange', DELIVERED: 'green' }
const PAYMENT_TONE = { Pagado: 'green', Parcial: 'orange', Pendiente: 'red' }
const FILTROS = [['activos', 'Activos'], ['archivados', 'Archivados'], ['todos', 'Todos']]

function relativeDate(value) {
  if (!value || Number.isNaN(Date.parse(value))) return 'Sin fecha'
  const date = new Date(value)
  const hora = date.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === new Date().toDateString()) return `Hoy ${hora}`
  if (date.toDateString() === new Date(Date.now() - 86400000).toDateString()) return `Ayer ${hora}`
  return `${date.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' })} ${hora}`
}
const ultimoImei = (row) => {
  const serial = (row.items || []).flatMap(item => Array.isArray(item.serials) ? item.serials : []).pop()
  return serial ? `••••${String(serial).slice(-4)}` : ''
}

// Fila compacta: una línea en escritorio (dos en móvil) con lo esencial.
function FilaPedido({ row, onClick }) {
  const cantidad = (row.items || []).reduce((sum, item) => sum + Number(item.quantity || 1), 0) || (row.products ? 1 : 0)
  return (
    <button
      type="button"
      data-testid="pedido-fila"
      onClick={onClick}
      className="group flex w-full flex-col gap-1.5 rounded-xl border border-fore/10 bg-ink-800/40 px-3.5 py-2.5 text-left transition hover:border-fono/40 hover:bg-ink-700/50 sm:flex-row sm:items-center sm:gap-3"
    >
      <span className="flex min-w-0 items-center gap-2 sm:flex-1">
        <span className="shrink-0 font-mono text-xs font-bold text-fono-light">{row.number}</span>
        <span className="hidden shrink-0 text-xs text-mute sm:inline">{relativeDate(row.date)}</span>
        <span className="min-w-0 truncate text-sm font-semibold">{row.customer}</span>
        <span className="hidden min-w-0 truncate text-xs text-mute lg:inline">{row.products}</span>
      </span>
      <span className="flex min-w-0 items-center gap-2 text-[11px] text-mute sm:justify-end">
        <span className="sm:hidden">{relativeDate(row.date)}</span>
        {ultimoImei(row) && <span className="rounded border border-ink-500 px-1.5 py-0.5 font-mono text-[10px] text-fono-light">{ultimoImei(row)}</span>}
        <span>{cantidad} artículo{cantidad === 1 ? '' : 's'}</span>
        <span className="hidden sm:inline">·</span>
        <span className="hidden sm:inline">{row.deliveryType || 'En tienda'}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 sm:ml-0">
          <span className={cn('rounded-md border px-1.5 py-0.5 text-[10px] font-bold', PAYMENT_TONE[row.paymentStatus] === 'green' ? 'border-ok/25 bg-ok/10 text-ok' : PAYMENT_TONE[row.paymentStatus] === 'orange' ? 'border-warn/25 bg-warn/10 text-warn' : 'border-bad/25 bg-bad/10 text-bad')}>{row.paymentStatus || 'Pendiente'}</span>
          <span className={cn('rounded-md border px-1.5 py-0.5 text-[10px] font-bold', FULFILLMENT_TONE[row.fulfillmentStatus] === 'green' ? 'border-ok/25 bg-ok/10 text-ok' : FULFILLMENT_TONE[row.fulfillmentStatus] === 'orange' ? 'border-warn/25 bg-warn/10 text-warn' : FULFILLMENT_TONE[row.fulfillmentStatus] === 'blue' ? 'border-fono/25 bg-fono/10 text-fono-light' : 'border-ink-500 bg-ink-700/40 text-mute')}>{FULFILLMENT[row.fulfillmentStatus] || row.fulfillmentStatus}</span>
          {row.archivedAt && <span className="rounded-md border border-ink-500 px-1.5 py-0.5 text-[10px] font-bold text-mute">Archivado</span>}
        </span>
        <span className="shrink-0 text-sm font-bold tabular-nums text-fore">{row.total != null && Number.isFinite(Number(row.total)) ? gs(row.total) : '—'}</span>
        <Icon name="chevron" className="h-3.5 w-3.5 shrink-0 -rotate-90 text-mute transition group-hover:text-fono-light" />
      </span>
    </button>
  )
}

export default function SellerOrders() {
  const { sesion, esDemo, usuario } = useSesion()
  const [query, setQuery] = useState('')
  const [filtro, setFiltro] = useState('activos')
  const [seleccion, setSeleccion] = useState(null)
  const data = useSellerData('/api/orders', orderFields, listVentas, esDemo, { limit: 50 })
  const esAdminVentas = Boolean(sesion?.esPropietario || ['ADMIN', 'GERENTE'].includes(sesion?.rol) || ['ADMIN', 'GERENTE'].includes(usuario?.role))
  const todas = useMemo(() => {
    const products = esDemo ? productosById() : {}
    return data.rows
      .filter((row) => esAdminVentas ? true : Boolean(sesion?.vendedorId) && row.sellerId === sesion.vendedorId)
      .map((row) => ({ ...row, products: row.products || products[row.productId]?.nombre || products[row.productId]?.name || '' }))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  }, [data.rows, esAdminVentas, sesion?.vendedorId, esDemo])
  const porCliente = useMemo(() => todas.reduce((acc, row) => { if (row.customerId) acc[row.customerId] = (acc[row.customerId] || 0) + 1; return acc }, {}), [todas])
  const rows = useMemo(() => todas
    .filter((row) => filtro === 'todos' ? true : filtro === 'archivados' ? Boolean(row.archivedAt) : !row.archivedAt)
    .filter((row) => `${row.number} ${row.customer} ${row.products} ${(row.tags || []).join(' ')}`.toLowerCase().includes(query.toLowerCase())), [todas, filtro, query])
  return <SellerSection title={esAdminVentas ? 'Pedidos' : 'Mis pedidos'} description="Cada pedido en una línea: estado, pago y entrega. Entrá para ver artículos, IMEIs, cliente y cronología.">
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1">{FILTROS.map(([key, label]) => <button key={key} type="button" onClick={() => setFiltro(key)} className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold transition', filtro === key ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore')}>{label}</button>)}</div>
      <div className="min-w-[200px] flex-1"><Input aria-label="Buscar pedidos" placeholder="Pedido, cliente, producto o etiqueta" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <button type="button" onClick={data.refresh} disabled={data.loading} className="rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore">Actualizar</button>
    </div>
    <SellerFeedback {...data} empty={!rows.length} />
    {!data.loading && !data.error && <div className="space-y-2">{rows.map((row) => <FilaPedido key={row.id} row={row} onClick={() => setSeleccion(row)} />)}</div>}
    {!data.loading && !data.error && data.hayMas && <div className="flex justify-center pt-1"><button type="button" disabled={data.cargandoMas} onClick={data.cargarMas} className="rounded-lg border border-ink-500 px-4 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore disabled:opacity-60">{data.cargandoMas ? 'Cargando…' : 'Cargar más pedidos'}</button></div>}
    {seleccion && <PedidoDetalle row={seleccion} esDemo={esDemo} customerOrderCount={seleccion.customerId ? porCliente[seleccion.customerId] || 0 : 0} onClose={() => setSeleccion(null)} onChanged={data.refresh} />}
  </SellerSection>
}
