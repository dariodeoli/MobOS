import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUrlState } from '@/hooks/useUrlState'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { listVentas, productosById } from '@/lib/storage'
import { gs } from '@/utils/calculos'
import { codigoPedido } from '@/utils/pedido'
import { normalizarBusqueda, nombreCortoCliente } from '@/utils/cliente'
import { Input } from '@/components/ui'
import { cn } from '@/lib/utils'
import SerialTexto from '@/components/shared/SerialTexto'
import { ultimos4 } from '@/utils/serial'
import { useBusquedaDiferida } from '@/hooks/useBusquedaDiferida'
import { SellerFeedback, SellerSection, useSellerData } from './SellerData'
import PedidoDetalle from './PedidoDetalle'
import Icon from '@/components/shared/Icon'

export const orderFields = (row) => {
  const pagos = row.payments || row.pagos || []
  const pagado = pagos.filter(p => p.status === 'CONFIRMED' || p.status === undefined).reduce((sum, p) => sum + Number(p.amountPyg ?? p.monto ?? 0), 0)
  const total = Number(row.totalPyg ?? row.total ?? row.precio ?? 0)
  const creditDays = Number(row.creditDays || 0)
  const items = Array.isArray(row.items) ? row.items : []
  const seriales = items.flatMap(item => Array.isArray(item.serials) ? item.serials : [])
  const products = items.length ? items.map(item => item.description).filter(Boolean) : [row.productoNombre].filter(Boolean)
  return {
    id: row.id, sellerId: row.sellerId ?? row.vendedorId,
    sellerName: row.seller?.name || row.vendedor || '',
    number: row.orderNumber || row.codigo || row.id,
    customer: row.customer?.name || row.cliente || 'Sin cliente',
    customerId: row.customerId || row.clienteId || null,
    date: row.createdAt || row.creadoEn || row.fecha,
    status: row.status || 'REGISTERED',
    paymentStatus: row.estadoPago || (pagado >= total && total > 0 ? 'Pagado' : pagado > 0 ? 'Parcial' : 'Pendiente'),
    paid: pagado, pending: Math.max(0, total - pagado), creditDays,
    total, productId: row.productoId,
    products: products.join(', '),
    fulfillmentStatus: row.fulfillmentStatus || row.entrega || 'PROCESSING',
    deliveryType: row.deliveryType || row.entrega || '',
    assignedTo: row.assignedTo?.name || '',
    publicToken: row.publicToken,
    items, payments: pagos, seriales,
    quantity: items.reduce((sum, item) => sum + Number(item.quantity || 1), 0) || (products.length ? 1 : 0),
    billingName: row.billingName || row.customer?.billingName || '',
    billingDocument: row.billingDocument || row.customer?.billingDocument || '',
    document: row.customer?.document || row.clienteDocumento || '',
    email: row.customer?.email || '',
    phone: row.customer?.phone || '',
    notes: row.notes || row.observacion || '',
    subtotalPyg: row.subtotalPyg, discountPyg: row.discountPyg, deliveryPyg: row.deliveryPyg,
    tags: Array.isArray(row.tags) ? row.tags : [], archivedAt: row.archivedAt || null,
    isSpecialOrder: row.isSpecialOrder === true || row.specialOrder === true,
    expectedAt: row.expectedAt || null,
  }
}
const FULFILLMENT = { PROCESSING: 'Preparando', IN_TRANSIT: 'En camino', READY_TO_SHIP: 'Listo p/ enviar', READY_FOR_PICKUP: 'Listo p/ retirar', DELIVERED: 'Entregado' }
const ENTREGA = { 'Retiro en tienda': 'Retiro', Delivery: 'Delivery', Encomienda: 'Encomienda' }
const PAGO_ORDEN = { Pagado: 0, Parcial: 1, 'A crédito': 2, Pendiente: 3 }
const ESTADO_ORDEN = { PROCESSING: 0, IN_TRANSIT: 1, READY_TO_SHIP: 2, READY_FOR_PICKUP: 3, DELIVERED: 4, CANCELLED: 5 }
const FILTROS = [
  ['activos', 'Activos'], ['nopagados', 'No pagados'], ['pendientes', 'Pendientes'],
  ['parciales', 'Parciales'], ['credito', 'A crédito'], ['archivados', 'Archivados'], ['todos', 'Todos'],
]

// Grid compartido por encabezado y filas: mismas columnas, mismo ancho.
// Los anchos compactos (pedido, fecha, cant., entrega, pago, estado) liberan
// espacio para cliente, artículos y serial; el total conserva su ancho porque
// los importes necesitan lugar. La grilla sigue siendo fija: un badge corto no
// corre la columna siguiente.
// Anchuras fijas lo más compactas posible (fecha, cantidad, entrega, pago y
// estado) para que la tabla entre sin scroll en pantallas de ~1024 px; el
// scroll queda solo como respaldo en anchos muy chicos (< 46rem).
const GRID = 'grid min-w-[46rem] grid-cols-[4.25rem_5.25rem_minmax(0,1.15fr)_minmax(0,1.6fr)_minmax(0,0.85fr)_2.25rem_3.75rem_3.75rem_4.75rem_6.5rem_1.75rem] items-center gap-x-1.5'

function fechaCompacta(value) {
  if (!value || Number.isNaN(Date.parse(value))) return 'Sin fecha'
  const date = new Date(value)
  const dia = date.toLocaleDateString('es-PY', { day: '2-digit' })
  const mes = date.toLocaleDateString('es-PY', { month: 'short' }).replace('.', '')
  const hora = date.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${dia} ${mes}·${hora}`
}

// Vista previa de artículos: hasta dos descripciones completas (con capacidad)
// en una sola línea compacta y "+N" cuando el pedido trae más productos.
const vistaArticulos = (row) => {
  const descripciones = (row.items?.length
    ? row.items.map(item => item.description)
    : String(row.products || '').split(','))
    .map(texto => String(texto || '').trim())
    .filter(Boolean)
  if (!descripciones.length) return { texto: '', extra: 0, completo: '' }
  return {
    texto: descripciones.slice(0, 2).join('·'),
    extra: Math.max(0, descripciones.length - 2),
    completo: descripciones.join('·'),
  }
}

const pagoDe = (row) => (row.creditDays > 0 && row.pending > 0 ? 'A crédito' : row.paymentStatus || 'Pendiente')
const estaCompletado = (row) => Boolean(row.archivedAt) || (row.paymentStatus === 'Pagado' && row.fulfillmentStatus === 'DELIVERED')
const estaCancelado = (row) => row.status === 'CANCELLED'

function BadgePago({ row }) {
  const estado = estaCancelado(row) ? row.paymentStatus : pagoDe(row)
  const tono = estado === 'Pagado' ? 'border-ok/25 bg-ok/10 text-ok'
    : estado === 'Parcial' ? 'border-warn/25 bg-warn/10 text-warn'
      : estado === 'A crédito' ? 'border-[#8b5cf6]/40 bg-[#8b5cf6]/10 text-reserved'
        : 'border-bad/25 bg-bad/10 text-bad'
  return <span className={cn('w-fit justify-self-start whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-bold', tono)}>{estado || 'Pendiente'}</span>
}

function BadgeEstado({ row }) {
  if (estaCancelado(row)) return <span className="w-fit justify-self-start whitespace-nowrap rounded-md border border-bad/30 bg-bad/10 px-1.5 py-0.5 text-[10px] font-bold text-bad">Cancelado</span>
  const tono = row.fulfillmentStatus === 'DELIVERED' ? 'border-ok/25 bg-ok/10 text-ok'
    : row.fulfillmentStatus === 'READY_TO_SHIP' ? 'border-sky-400/25 bg-sky-400/10 text-sky-300'
      : row.fulfillmentStatus === 'READY_FOR_PICKUP' ? 'border-warn/25 bg-warn/10 text-warn'
        : row.fulfillmentStatus === 'IN_TRANSIT' ? 'border-fono/25 bg-fono/10 text-fono-light'
          : 'border-ink-500 bg-ink-700/40 text-mute'
  return <span className={cn('w-fit justify-self-start whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-bold', tono)}>{FULFILLMENT[row.fulfillmentStatus] || row.fulfillmentStatus || 'Preparando'}</span>
}

// Serial/IMEI: completo cuando entra; si la columna queda corta se recorta la
// cabeza y los últimos 4 caracteres siguen siempre visibles y destacados.
function CeldaSerial({ serial }) {
  return <SerialTexto serial={serial} className="text-[11px] text-mute" tonoCola="font-extrabold text-fono-light" />
}

const buscable = (row) => normalizarBusqueda([
  row.number, String(row.number).replace(/\D/g, ''), row.customer, row.sellerName, row.billingName, row.billingDocument,
  row.document, row.email, row.phone, row.notes, (row.tags || []).join(' '), row.products,
  row.seriales.join(' '), row.seriales.map(serial => ultimos4(serial)).join(' '), String(row.total),
].filter(Boolean).join(' '))

function FilaPedido({ row, onClick, onAcciones }) {
  const cancelado = estaCancelado(row)
  const tachado = cancelado ? 'line-through decoration-bad/70' : ''
  const ultimo = row.seriales.length ? String(row.seriales[row.seriales.length - 1]) : ''
  const articulos = vistaArticulos(row)
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="pedido-fila"
      aria-label={`Abrir pedido ${codigoPedido(row.number)}`}
      onClick={onClick}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick?.() } }}
      className={cn(
        'w-full rounded-xl border border-fore/10 bg-ink-800/40 px-2.5 py-1.5 text-left transition hover:border-fono/40 hover:bg-ink-700/50',
        estaCompletado(row) && !cancelado && 'opacity-70 hover:opacity-100',
      )}
    >
      <div className={GRID}>
        <span className={cn('truncate font-mono text-xs font-bold text-fono-light', tachado)} title={row.number}>{codigoPedido(row.number)}</span>
        <span className={cn('truncate text-xs text-mute', tachado)}>{fechaCompacta(row.date)}</span>
        <span className="flex min-w-0 items-center gap-1">
          <span className={cn('truncate text-[13px] font-semibold', tachado)} title={row.customer}>{nombreCortoCliente(row.customer)}</span>
          {row.isSpecialOrder && (
            <span
              className="shrink-0 rounded border border-warn/30 bg-warn/10 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-warn"
              title={row.expectedAt && !Number.isNaN(Date.parse(row.expectedAt)) ? `Pedido especial · esperado ${new Date(row.expectedAt).toLocaleDateString('es-PY')}` : 'Pedido especial'}
            >
              Especial
            </span>
          )}
        </span>
        <span className={cn('truncate text-xs text-mute', tachado)} title={articulos.completo || undefined}>
          {articulos.texto || '—'}
          {articulos.extra > 0 && <span className="ml-1 font-semibold text-fono-light">+{articulos.extra}</span>}
        </span>
        <CeldaSerial serial={ultimo} />
        <span className={cn('text-xs font-semibold tabular-nums', tachado)}>×{row.quantity || 1}</span>
        <span className={cn('truncate text-xs text-mute', tachado)}>{ENTREGA[row.deliveryType] || row.deliveryType || 'Retiro'}</span>
        <BadgePago row={row} />
        <BadgeEstado row={row} />
        <span className={cn('truncate text-right text-[13px] font-bold tabular-nums text-fore', tachado)}>
          {Number.isFinite(Number(row.total)) ? gs(row.total) : '—'}
        </span>
        {/* Vista rápida: es la última columna de la grilla, así queda alineada
            con su encabezado y no pisa el total. */}
        <span className="grid place-items-center">
          {onAcciones && (
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); onAcciones() }}
              title="Vista rápida (panel)"
              aria-label={`Vista rápida de ${codigoPedido(row.number)}`}
              className="grid h-7 w-7 place-items-center rounded-lg border border-ink-500 text-mute transition hover:border-fono hover:text-fore"
            >
              <Icon name="eye" className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      </div>
    </div>
  )
}

export default function SellerOrders() {
  const { sesion, esDemo, usuario } = useSesion()
  const navigate = useNavigate()
  // El pedido abierto vive en la URL por su id interno (UUID), nunca por el
  // código comercial: si el código cambia, el enlace sigue resolviendo.
  const { orderId } = useParams()
  const [query, setQuery] = useState('')
  // La búsqueda del listado se resuelve en el servidor: así encuentra pedidos
  // que todavía no están en la página cargada (número, cliente, RUC, vendedor).
  const [filtro, setFiltro] = useUrlState('filtro', 'activos')
  const [orden, setOrden] = useState({ key: 'date', dir: 'desc' })
  // Búsqueda y filtros van al servidor (cubren todos los pedidos del alcance
  // del usuario, no solo la página cargada). El texto se difiere 250 ms.
  const busqueda = useBusquedaDiferida(query)
  const path = useMemo(() => {
    const params = new URLSearchParams({ filtro })
    const texto = busqueda.trim()
    if (texto) params.set('q', texto)
    return `/api/orders?${params.toString()}`
  }, [filtro, busqueda])
  const data = useSellerData(path, orderFields, listVentas, esDemo, { limit: 50 })
  const esAdminVentas = Boolean(sesion?.esPropietario || ['ADMIN', 'GERENTE'].includes(sesion?.rol) || ['ADMIN', 'GERENTE'].includes(usuario?.role))
  const todas = useMemo(() => {
    const products = esDemo ? productosById() : {}
    return data.rows
      // En la demo no hay backend que acote por vendedor; con sesión API el
      // alcance por rol ya lo aplica el servidor.
      .filter((row) => esDemo && !esAdminVentas ? Boolean(sesion?.vendedorId) && row.sellerId === sesion.vendedorId : true)
      .map((row) => {
        const completa = {
          ...row,
          products: row.products || products[row.productId]?.nombre || products[row.productId]?.name || '',
        }
        return { ...completa, busqueda: buscable(completa) }
      })
  }, [data.rows, esAdminVentas, sesion?.vendedorId, esDemo])
  const porCliente = useMemo(() => todas.reduce((acc, row) => { if (row.customerId) acc[row.customerId] = (acc[row.customerId] || 0) + 1; return acc }, {}), [todas])

  const rows = useMemo(() => {
    let visibles = todas
    if (esDemo) {
      const texto = normalizarBusqueda(query)
      visibles = todas.filter((row) => {
        const completado = estaCompletado(row)
        if (filtro === 'activos') return !completado && !estaCancelado(row)
        if (filtro === 'archivados') return completado
        if (filtro === 'nopagados') return row.pending > 0 && !estaCancelado(row)
        if (filtro === 'pendientes') return pagoDe(row) === 'Pendiente' && !estaCancelado(row)
        if (filtro === 'parciales') return pagoDe(row) === 'Parcial' && !estaCancelado(row)
        if (filtro === 'credito') return pagoDe(row) === 'A crédito' && !estaCancelado(row)
        return true
      })
      if (texto) visibles = visibles.filter((row) => row.busqueda.includes(texto))
    }
    const factor = orden.dir === 'asc' ? 1 : -1
    const valor = (row) => {
      if (orden.key === 'number') return String(row.number).replace(/\D/g, '') || row.number
      if (orden.key === 'date') return new Date(row.date || 0).getTime()
      if (orden.key === 'customer') return normalizarBusqueda(row.customer)
      if (orden.key === 'products') return normalizarBusqueda(row.products)
      if (orden.key === 'quantity') return row.quantity || 0
      if (orden.key === 'delivery') return normalizarBusqueda(row.deliveryType)
      if (orden.key === 'payment') return PAGO_ORDEN[pagoDe(row)] ?? 9
      if (orden.key === 'fulfillment') return ESTADO_ORDEN[estaCancelado(row) ? 'CANCELLED' : row.fulfillmentStatus] ?? 9
      return Number(row.total) || 0
    }
    return [...visibles].sort((a, b) => {
      const va = valor(a); const vb = valor(b)
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb), 'es') * factor
      return (va - vb) * factor
    })
  }, [todas, filtro, query, orden, esDemo])

  // El detalle sale de la fila cargada; si se entra por URL directa (recarga,
  // enlace compartido) o el pedido quedó fuera de la página, se resuelve por
  // su id contra la API. Si no existe, se vuelve al listado.
  const seleccion = useMemo(() => (orderId ? rows.find((row) => row.id === orderId) || null : null), [orderId, rows])
  const [pedidoDirecto, setPedidoDirecto] = useState(null)
  useEffect(() => {
    if (!orderId || seleccion) { setPedidoDirecto(null); return undefined }
    let activo = true
    api.get(`/api/orders/${encodeURIComponent(orderId)}`)
      .then((row) => { if (activo) setPedidoDirecto(orderFields(row)) })
      .catch(() => { if (activo) { setPedidoDirecto(null); navigate('/pos/pedidos', { replace: true }) } })
    return () => { activo = false }
  }, [orderId, seleccion, navigate])
  const recargarDirecto = async () => {
    if (!orderId) return
    try { setPedidoDirecto(orderFields(await api.get(`/api/orders/${encodeURIComponent(orderId)}`))) } catch { /* el listado ya se refrescó */ }
  }
  const [pedidoPanel, setPedidoPanel] = useState(null)
  const detalleAbierto = seleccion || pedidoDirecto
  const abrirPedido = (row) => navigate(`/pos/pedidos/${encodeURIComponent(row.id)}`)
  const cerrarPedido = () => navigate('/pos/pedidos')

  const ordenarPor = (key) => setOrden((current) => current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'date' || key === 'total' || key === 'quantity' ? 'desc' : 'asc' })
  const encabezado = (key, label, extra = '') => (
    <button type="button" onClick={() => ordenarPor(key)} className={cn('flex items-center gap-1 truncate text-left text-[10px] font-bold uppercase tracking-wider transition hover:text-fore', orden.key === key ? 'text-fono-light' : 'text-mute', extra)}>
      {label}
      <span className="shrink-0">{orden.key === key ? (orden.dir === 'asc' ? '↑' : '↓') : ''}</span>
    </button>
  )

  return <SellerSection description="Una fila por pedido, alineada y ordenable: entrá para ver artículos, IMEIs, cliente y cronología.">
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1">{FILTROS.map(([key, label]) => <button key={key} type="button" onClick={() => setFiltro(key)} className={cn('rounded-lg px-2.5 py-1.5 text-xs font-semibold transition', filtro === key ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore')}>{label}</button>)}</div>
      <div className="min-w-[220px] flex-1"><Input aria-label="Buscar pedidos" placeholder="Pedido, cliente, RUC, teléfono, producto, IMEI o monto" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <button type="button" onClick={data.refresh} disabled={data.loading} className="rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore">Actualizar</button>
    </div>
    <SellerFeedback {...data} empty={!rows.length} />
    {!data.loading && !data.error && (
      <div className="overflow-x-auto" data-testid="pedidos-tabla">
        <div className={cn(GRID, 'px-2.5 pb-0.5 pt-1')}>
          {encabezado('number', 'Pedido')}
          {encabezado('date', 'Fecha')}
          {encabezado('customer', 'Cliente')}
          {encabezado('products', 'Artículos')}
          <span className="text-[10px] font-bold uppercase tracking-wider text-mute">Serial</span>
          {encabezado('quantity', 'Cant.')}
          {encabezado('delivery', 'Entrega')}
          {encabezado('payment', 'Pago')}
          {encabezado('fulfillment', 'Estado')}
          {encabezado('total', 'Total', 'justify-end')}
          <span aria-hidden="true" />
        </div>
        <div className="space-y-1">{rows.map((row) => <FilaPedido key={row.id} row={row} onClick={() => abrirPedido(row)} onAcciones={() => setPedidoPanel(row)} />)}</div>
      </div>
    )}
    {!data.loading && !data.error && data.hayMas && <div className="flex justify-center pt-1"><button type="button" disabled={data.cargandoMas} onClick={data.cargarMas} className="rounded-lg border border-ink-500 px-4 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore disabled:opacity-60">{data.cargandoMas ? 'Cargando…' : 'Cargar más pedidos'}</button></div>}
    {detalleAbierto && (
      <PedidoDetalle
        key={detalleAbierto.id}
        pagina
        row={detalleAbierto}
        esDemo={esDemo}
        customerOrderCount={detalleAbierto.customerId ? porCliente[detalleAbierto.customerId] || 0 : 0}
        onClose={cerrarPedido}
        onChanged={() => { data.refresh(); recargarDirecto() }}
      />
    )}
    {pedidoPanel && !detalleAbierto && (
      <PedidoDetalle
        key={pedidoPanel.id}
        row={pedidoPanel}
        esDemo={esDemo}
        customerOrderCount={pedidoPanel.customerId ? porCliente[pedidoPanel.customerId] || 0 : 0}
        onClose={() => setPedidoPanel(null)}
        onChanged={() => { data.refresh(); setPedidoPanel(null) }}
      />
    )}
  </SellerSection>
}
