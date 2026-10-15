import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useUrlState } from '@/hooks/useUrlState'
import { usePantallaAngosta } from '@/hooks/usePantallaAngosta'
import { useSesion } from '@/lib/sesion'
import { listVentas, productosById } from '@/lib/storage'
import { gs } from '@/utils/calculos'
import { codigoPedido, fechaLegible } from '@/utils/pedido'
import { normalizarBusqueda } from '@/utils/cliente'
import { Button, EmptyState, MenuDesplegable } from '@/components/ui'
import VentanaDetalle from '@/components/shared/VentanaDetalle'
import { cn } from '@/lib/utils'
import SerialTexto from '@/components/shared/SerialTexto'
import { ultimos4 } from '@/utils/serial'
import { useBusquedaDiferida } from '@/hooks/useBusquedaDiferida'
import SearchField from '@/components/shared/SearchField'
import { SellerFeedback, SellerSection, useSellerData } from './SellerData'
import Toolbar from '@/components/shared/Toolbar'
import ChipsFiltro from './ChipsFiltro'
import ResumenMetricas from '@/components/shared/ResumenMetricas'
import PedidoDetalle from './PedidoDetalle'
import Icon from '@/components/shared/Icon'
import { FULFILLMENT_LABELS as FULFILLMENT } from '@/lib/constants'
import './ventasF3.css'

export const orderFields = (row) => {
  const pagos = row.payments || row.pagos || []
  const pagado = pagos.filter(p => p.status === 'CONFIRMED' || p.status === undefined).reduce((sum, p) => sum + Number(p.amountPyg ?? p.monto ?? 0), 0)
  const total = Number(row.totalPyg ?? row.total ?? (Number(row.precio || 0) + Number(row.montoDelivery || 0)))
  const creditDays = Number(row.creditDays || 0)
  // Venta legacy del demo (una línea con producto, precio y envío): se
  // sintetiza el artículo real para que la ficha, el listado y el comprobante
  // muestren lo mismo. Con los ítems del API no se toca nada (#318).
  const items = Array.isArray(row.items) && row.items.length
    ? row.items
    : row.productoNombre
      ? [{ id: row.id, description: row.productoNombre, quantity: 1, unitPricePyg: Number(row.precio ?? 0), totalPyg: Number(row.precio ?? 0) }]
      : []
  const seriales = items.flatMap(item => Array.isArray(item.serials) ? item.serials : [])
  const products = items.length ? items.map(item => item.description).filter(Boolean) : [row.productoNombre].filter(Boolean)
  return {
    id: row.id, sellerId: row.sellerId ?? row.vendedorId,
    sellerName: row.seller?.name || row.vendedor || '',
    branchName: row.branch?.name || row.sucursal || '',
    // #313: al listado solo viaja un código humano (orderNumber/codigo de la
    // orden). Antes caía al id interno y la fila mostraba «demo-ven…».
    number: row.orderNumber || row.codigo || '',
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
    paymentOnDelivery: Boolean(row.paymentOnDelivery),
    shippingCarrier: row.shippingCarrier || '',
    shippingBranch: row.shippingBranch || '',
    shippingAddress: row.shippingAddress || '',
    publicToken: row.publicToken,
    items, payments: pagos, seriales,
    quantity: items.reduce((sum, item) => sum + Number(item.quantity || 1), 0) || (products.length ? 1 : 0),
    billingName: row.billingName || row.customer?.billingName || '',
    billingDocument: row.billingDocument || row.customer?.billingDocument || '',
    document: row.customer?.document || row.clienteDocumento || '',
    email: row.customer?.email || '',
    phone: row.customer?.phone || '',
    notes: row.notes || row.observacion || '',
    subtotalPyg: row.subtotalPyg ?? (items.length ? items.reduce((sum, item) => sum + Number(item.totalPyg || 0), 0) : undefined),
    discountPyg: row.discountPyg ?? row.descuento, deliveryPyg: row.deliveryPyg ?? row.montoDelivery,
    tags: Array.isArray(row.tags) ? row.tags : [], archivedAt: row.archivedAt || null,
    offlineSyncedAt: row.offlineSyncedAt || null,
    isSpecialOrder: row.isSpecialOrder === true || row.specialOrder === true,
    expectedAt: row.expectedAt || null,
  }
}
// Etiquetas compartidas: incluyen los estados nuevos de entrega (enviado,
// retirado, parcial, no entregado).
const ENTREGA = { RETIRO: 'Retiro', DELIVERY: 'Delivery', 'Retiro en tienda': 'Retiro', 'Retiro en otra sucursal': 'Retiro en otra sucursal', Delivery: 'Delivery', Encomienda: 'Encomienda', 'Envío entre sucursales': 'Envío entre sucursales' }
const PAGO_ORDEN = { Pagado: 0, Parcial: 1, 'A crédito': 2, Pendiente: 3 }
const ESTADO_ORDEN = { PENDING: 0, PROCESSING: 1, READY_TO_SHIP: 2, SHIPPED: 3, IN_TRANSIT: 4, READY_FOR_PICKUP: 5, PARTIAL: 6, NOT_DELIVERED: 7, PICKED_UP: 8, DELIVERED: 9, CANCELLED: 10 }
const FILTROS = [
  ['activos', 'Activos'], ['nopagados', 'Con saldo'], ['credito', 'A crédito'], ['archivados', 'Archivados'], ['todos', 'Todos'],
]
// Estados de pago poco frecuentes: el chip «Más estados» los despliega.
const FILTROS_MAS = [['pendientes', 'Pendientes'], ['parciales', 'Parciales']]
// Campos por los que se ordena el listado (menú «Ordenar»).
const CAMPOS_ORDEN = [
  ['date', 'Fecha'], ['number', 'Pedido'], ['customer', 'Cliente'], ['products', 'Artículos'], ['quantity', 'Cantidad'],
  ['delivery', 'Entrega'], ['payment', 'Pago'], ['fulfillment', 'Estado'], ['total', 'Total'],
]

// Shared desktop columns; narrow views render cards without a minimum table width.
const GRID = 'ventas-f3-order-grid'

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
// «Paga al recibir» (#399): sigue visible mientras quede saldo por cobrar.
export const esPagaAlRecibirPendiente = (row) => Boolean(row.paymentOnDelivery) && Number(row.pending || 0) > 0 && !estaCancelado(row)

function ChipPagaAlRecibir({ row }) {
  if (!esPagaAlRecibirPendiente(row)) return null
  return <span data-testid="chip-paga-al-recibir" className="w-fit justify-self-start whitespace-nowrap rounded-md border border-warn/30 bg-warn/10 px-1.5 py-0.5 text-[10px] font-bold text-warn-text">Paga al recibir</span>
}

const PERIODOS = [['hoy', 'Hoy'], ['7d', '7 días'], ['30d', '30 días']]
const PREPARADOS = ['READY_TO_SHIP', 'READY_FOR_PICKUP', 'SHIPPED', 'IN_TRANSIT', 'PARTIAL', 'DELIVERED', 'PICKED_UP']
const ENTREGADOS = ['DELIVERED', 'PICKED_UP']

// KPI de la tira: cuenta lo cargado en pantalla dentro del período y arma una
// serie por tramo (hora en «Hoy», día en 7/30 días) para la mini-tendencia.
export function kpisPedidos(rows, periodo, ahora = new Date()) {
  const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime()
  const horas = periodo === 'hoy'
  const tramos = horas ? Math.max(2, ahora.getHours() + 1) : periodo === '7d' ? 7 : 30
  const tamano = horas ? 3600000 : 86400000
  const desde = horas ? inicioHoy : inicioHoy - (tramos - 1) * 86400000
  const definiciones = [
    ['pedidos', row => !estaCancelado(row), () => 1],
    ['articulos', row => !estaCancelado(row), row => Number(row.quantity || 0)],
    ['devoluciones', estaCancelado, () => 1],
    ['preparados', row => !estaCancelado(row) && PREPARADOS.includes(row.fulfillmentStatus), () => 1],
    ['entregados', row => !estaCancelado(row) && ENTREGADOS.includes(row.fulfillmentStatus), () => 1],
  ]
  const salida = Object.fromEntries(definiciones.map(([clave]) => [clave, { total: 0, serie: Array(tramos).fill(0) }]))
  for (const row of rows) {
    const t = new Date(row.date || 0).getTime()
    if (!Number.isFinite(t) || t < desde || t > ahora.getTime()) continue
    const indice = Math.min(tramos - 1, Math.floor((t - desde) / tamano))
    for (const [clave, cuenta, peso] of definiciones) {
      if (!cuenta(row)) continue
      salida[clave].total += peso(row)
      salida[clave].serie[indice] += peso(row)
    }
  }
  return salida
}

function BadgePago({ row, v2 }) {
  const estado = estaCancelado(row) ? row.paymentStatus : pagoDe(row)
  const tono = estado === 'Pagado' ? 'border-ok/25 bg-ok/10 text-ok-text'
    : estado === 'Parcial' ? 'border-warn/25 bg-warn/10 text-warn-text'
      : estado === 'A crédito' ? 'border-reserved/40 bg-reserved/10 text-reserved'
        : 'border-bad/25 text-bad-text'
  return <span className={cn('w-fit justify-self-start whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-bold', v2 && 'v2-chip', tono)}>{(estado === 'Pendiente' ? 'Pago pendiente' : estado) || 'Pago pendiente'}</span>
}

function BadgeEstado({ row, v2 }) {
  if (estaCancelado(row)) return <span className={cn('w-fit justify-self-start whitespace-nowrap rounded-md border border-bad/30 px-1.5 py-0.5 text-[10px] font-bold text-bad-text', v2 && 'v2-chip')}>Cancelado</span>
  const tono = ['DELIVERED', 'PICKED_UP'].includes(row.fulfillmentStatus) ? 'border-ok/25 bg-ok/10 text-ok-text'
    : ['READY_TO_SHIP', 'SHIPPED', 'IN_TRANSIT'].includes(row.fulfillmentStatus) ? 'border-info/25 bg-info/10 text-info'
      : ['READY_FOR_PICKUP', 'PARTIAL'].includes(row.fulfillmentStatus) ? 'border-warn/25 bg-warn/10 text-warn-text'
        : row.fulfillmentStatus === 'NOT_DELIVERED' ? 'border-bad/30 text-bad-text'
          : 'border-ink-500 bg-ink-700/40 text-mute'
  return <span className={cn('w-fit justify-self-start whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-bold', v2 && 'v2-chip', tono)}>{FULFILLMENT[row.fulfillmentStatus] || row.fulfillmentStatus || 'Preparando'}</span>
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

// Acento de color por estado de pago: la fila se lee de un vistazo sin tener
// que buscar el badge (verde pagado, ámbar parcial, violeta crédito, rojo
// pendiente/cancelado).
const ACENTO_PAGO = (row) => {
  if (estaCancelado(row)) return 'border-l-bad/70'
  const estado = pagoDe(row)
  if (estado === 'Pagado') return 'border-l-ok'
  if (estado === 'Parcial') return 'border-l-warn'
  if (estado === 'A crédito') return 'border-l-reserved'
  return 'border-l-bad/60'
}

function FilaPedido({ row, onClick, onAcciones, onCobrar, v2, angosta = false }) {
  const cancelado = estaCancelado(row)
  const articulos = vistaArticulos(row)
  const total = Number.isFinite(Number(row.total)) ? gs(row.total) : '—'
  const codigo = codigoPedido(row.number) || 'Pedido'
  const entrega = ENTREGA[row.deliveryType] || row.deliveryType || 'Retiro'
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="pedido-fila"
      aria-label={`Abrir pedido ${codigo}`}
      onClick={onClick}
      onKeyDown={event => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onClick?.()
        }
      }}
      className={cn('ventas-f3-order-row', !angosta && GRID, ACENTO_PAGO(row))}
    >
      <div className="ventas-f3-order-code">
        <span className={cn('font-mono text-xs font-semibold', cancelado && 'line-through')}>
          {codigo}
        </span>
        {row.isSpecialOrder && <span className="ml-1.5 text-xs text-warn-text">Especial</span>}
        {row.offlineSyncedAt && <span className="ml-1.5 text-xs text-warn-text">Offline</span>}
      </div>
      <span className="ventas-f3-order-date text-xs text-mute">{fechaLegible(row.date)}</span>
      <div className="ventas-f3-order-identity">
        <p className="ventas-f3-name">{row.customer}</p>
        <p className="ventas-f3-description" title={articulos.completo || undefined}>
          {articulos.texto || 'Sin artículos'}
          {articulos.extra > 0 ? ` +${articulos.extra}` : ''}
        </p>
      </div>
      <span className="ventas-f3-delivery text-xs text-mute" title={row.branchName ? `${row.branchName} · ${entrega}` : entrega}>
        {row.branchName ? <><span className="block truncate text-fore">{row.branchName}</span><span className="block truncate">{entrega}</span></> : entrega}
      </span>
      <span className="ventas-f3-payment flex flex-wrap items-center gap-1">
        <BadgePago row={row} v2={v2} />
        <ChipPagaAlRecibir row={row} />
        {esPagaAlRecibirPendiente(row) && onCobrar ? (
          <button
            type="button"
            data-testid="pedido-cobrar"
            onClick={event => { event.stopPropagation(); onCobrar() }}
            onKeyDown={event => event.stopPropagation()}
            aria-label={`Cobrar pedido ${codigo}`}
            className="min-h-11 rounded-md border border-fono/40 px-2 text-[11px] font-bold text-fono-light hover:bg-fono/10 md:min-h-0 md:py-0.5"
          >Cobrar</button>
        ) : null}
      </span>
      <span className="ventas-f3-state">
        <BadgeEstado row={row} v2={v2} />
      </span>
      <span className="ventas-f3-money ventas-f3-order-total">{total}</span>
      <button
        type="button"
        onClick={event => {
          event.stopPropagation()
          onAcciones?.()
        }}
        aria-label={`Vista rápida de ${codigo}`}
        title="Vista rápida"
        className="ventas-f3-quick grid h-11 w-11 place-items-center rounded-lg border border-ink-600 text-mute hover:text-fore lg:h-9 lg:w-9"
      >
        <Icon name="eye" className="h-4 w-4" />
      </button>
    </div>
  )
}

// Fila etiqueta/valor del panel rápido: montos y datos alineados a la derecha.
function FilaResumen({ etiqueta, children, tono = '' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="shrink-0 text-mute">{etiqueta}</dt>
      <dd className={cn('min-w-0 text-right font-semibold tabular-nums break-words', tono)}>{children}</dd>
    </div>
  )
}

// #313: la vista rápida del listado ya no repite el detalle completo. Muestra
// el resumen del pedido (cliente, artículos y totales) y deriva a la página
// exclusiva, donde viven la impresión, los cobros y la cronología.
function VistaRapidaPedido({ row, onClose, onAbrir, onCobrar }) {
  const articulos = vistaArticulos(row)
  const total = Number(row.total || 0)
  const pagado = Number(row.paid || 0)
  const pendiente = Number(row.pending || 0)
  return (
    <VentanaDetalle open onClose={onClose} title={codigoPedido(row.number) || 'Pedido'} className="ventas-f3">
      <div className="space-y-4" data-testid="pedido-vista-rapida">
        <div className="flex flex-wrap items-center gap-2">
          <BadgePago row={row} v2 />
          <ChipPagaAlRecibir row={row} />
          <BadgeEstado row={row} v2 />
        </div>
        <dl className="ventas-f3-summary space-y-2">
          <FilaResumen etiqueta="Cliente">{row.customer}</FilaResumen>
          <FilaResumen etiqueta="Fecha">{fechaLegible(row.date)}</FilaResumen>
          <FilaResumen etiqueta="Artículos">
            {articulos.texto || 'Sin artículos'}{articulos.extra > 0 ? ` +${articulos.extra}` : ''}
          </FilaResumen>
          <FilaResumen etiqueta="Cantidad">{row.quantity || 1}</FilaResumen>
          {row.seriales?.length > 0 && <FilaResumen etiqueta="Serial/IMEI"><CeldaSerial serial={row.seriales[row.seriales.length - 1]} /></FilaResumen>}
          <FilaResumen etiqueta="Entrega">{ENTREGA[row.deliveryType] || row.deliveryType || 'Retiro'}</FilaResumen>
          {row.sellerName && <FilaResumen etiqueta="Vendedor">{row.sellerName}</FilaResumen>}
        </dl>
        <dl className="ventas-f3-summary space-y-2">
          <FilaResumen etiqueta="Total">{Number.isFinite(total) ? gs(total) : '—'}</FilaResumen>
          <FilaResumen etiqueta="Pagado" tono="text-ok">{gs(pagado)}</FilaResumen>
          <FilaResumen etiqueta="Saldo" tono={pendiente > 0 ? 'text-warn' : ''}>{gs(pendiente)}</FilaResumen>
        </dl>
        <div className="flex flex-wrap justify-end border-t border-ink-600 pt-3">
          {esPagaAlRecibirPendiente(row) && onCobrar ? <Button type="button" variant="outline" className="mr-2" onClick={onCobrar}>Cobrar</Button> : null}
          <Button type="button" onClick={onAbrir}>Ver pedido completo</Button>
        </div>
      </div>
    </VentanaDetalle>
  )
}

export default function SellerOrders() {
  const { sesion, esDemo, usuario } = useSesion()
  const navigate = useNavigate()
  // El pedido abierto vive en la URL por su id interno (UUID), nunca por el
  // código comercial: si el código cambia, el enlace sigue resolviendo.
  const { orderId } = useParams()
  // Los filtros de la lista viajan con el pedido para que «Volver a pedidos»
  // restituya la misma vista (antes se perdía el filtro y el listado parecía
  // recargarse solo).
  const location = useLocation()
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

  // F3 is visible without a flag; values retain the existing loaded-row scope.
  const v2 = true
  // #313: en móvil la lista se muestra como tarjetas (no tabla comprimida).
  const angosta = usePantallaAngosta('(min-width: 1200px)')
  const [periodo, setPeriodo] = useUrlState('periodo', 'hoy')
  const kpis = useMemo(() => kpisPedidos(rows, PERIODOS.some(([id]) => id === periodo) ? periodo : 'hoy'), [rows, periodo])

  // El pedido abierto sale de la fila ya cargada (pintado instantáneo); si se
  // entra por URL directa (recarga, enlace compartido, pedido fuera de la
  // página) el detalle se resuelve solo por su id interno contra la API. La
  // página es exclusiva: antes el detalle quedaba debajo del listado, fuera del
  // viewport, y parecía que el enlace no cargaba.
  // Se busca en todas las filas cargadas, no en las filtradas: un filtro o una
  // búsqueda que cambian con el pedido abierto no deben cerrarlo.
  const seleccion = useMemo(() => (orderId ? todas.find((row) => row.id === orderId) || null : null), [orderId, todas])
  const [pedidoPanel, setPedidoPanel] = useState(null)
  // Respaldo estable: sin el memo, cada render creaba un `{ id }` nuevo,
  // PedidoDetalle recargaba el pedido en loop y el modal del cliente perdía lo
  // tipeado.
  const respaldo = useMemo(() => (orderId ? { id: orderId } : null), [orderId])
  const detalleAbierto = seleccion || (!esDemo ? respaldo : null)
  const abrirPedido = (row, opciones) => navigate(`/pedidos/${encodeURIComponent(row.id)}${location.search}`, opciones)
  const cobrarPedido = (row) => abrirPedido(row, { state: { cobrar: true } })
  const cerrarPedido = () => navigate(`/pedidos${location.search}`)

  const ordenarPor = (key) => setOrden((current) => current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'date' || key === 'total' || key === 'quantity' ? 'desc' : 'asc' })
  const encabezado = (key, label, extra = '') => (
    <button type="button" onClick={() => ordenarPor(key)} className={cn('flex min-h-11 items-center gap-1 text-left text-xs font-medium transition hover:text-fore', orden.key === key ? 'text-fono-light' : 'text-mute', extra)}>
      {label}
      <span className="shrink-0">{orden.key === key ? (orden.dir === 'asc' ? '↑' : '↓') : ''}</span>
    </button>
  )

  if (detalleAbierto) {
    // Anterior / siguiente según el orden y los filtros del listado.
    const indice = rows.findIndex((row) => row.id === detalleAbierto.id)
    const vecino = (delta) => (indice > -1 ? rows[indice + delta] || null : null)
    return <PedidoDetalle
      key={detalleAbierto.id}
      pagina
      row={detalleAbierto}
      navegacion={{ anterior: vecino(-1), siguiente: vecino(1), onIr: abrirPedido }}
      esDemo={esDemo}
      customerOrderCount={detalleAbierto.customerId ? porCliente[detalleAbierto.customerId] || 0 : 0}
      onClose={cerrarPedido}
      onChanged={data.refresh}
      abrirCobro={Boolean(location.state?.cobrar)}
    />
  }

  if (orderId) {
    // Demo o pedido que no está en la lista local: no hay backend que lo
    // resuelva, así que se avisa con salida en vez de quedar en blanco.
    return <SellerSection title="Pedido" description="Ese pedido no está disponible en esta vista.">
      <EmptyState
        icon="box"
        title="No encontramos el pedido en esta vista."
        action={<Button variant="outline" onClick={cerrarPedido}>Volver a pedidos</Button>}
      />
    </SellerSection>
  }

  return (
    <div className="ventas-f3" data-testid="ventas-pedidos-f3">
      <SellerSection title="Pedidos">
        <Toolbar
          label="Acciones de Pedidos"
          lista
          testId="barra-pedidos"
          className="ventas-f3-toolbar"
          plano
          search={
            <SearchField
              ariaLabel="Buscar pedidos"
              placeholder="Pedido, cliente, RUC, producto o IMEI"
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
          }
          filters={
            <ChipsFiltro
              className="min-w-0"
              etiqueta="Estado de los pedidos"
              opciones={FILTROS}
              mas={FILTROS_MAS}
              valor={filtro}
              onChange={setFiltro}
            />
          }
          sort={
            <div data-testid="pedidos-orden" data-orden={orden.key} data-dir={orden.dir}>
              <MenuDesplegable
                alineacion="left"
                ariaLabel="Ordenar pedidos"
                trigger={
                  <span className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-ink-500 px-3 text-xs font-semibold text-mute lg:min-h-9">
                    Ordenar
                    <Icon name="chevron" className="h-3.5 w-3.5" />
                  </span>
                }
                items={[
                  ...CAMPOS_ORDEN.map(([key, label]) => ({
                    id: key,
                    label,
                    extra: orden.key === key ? <span aria-hidden="true">{orden.dir === 'asc' ? '↑' : '↓'}</span> : null,
                    onClick: () => (orden.key === key ? null : ordenarPor(key)),
                  })),
                  { separador: true },
                  { id: 'invertir', label: orden.dir === 'asc' ? 'Invertir: de mayor a menor' : 'Invertir: de menor a mayor', onClick: () => ordenarPor(orden.key) },
                ]}
              />
            </div>
          }
          primary={
            <Button type="button" onClick={() => navigate('/pos')}>
              Nueva venta
            </Button>
          }
        />
        {v2 && rows.length > 0 && (
          <ResumenMetricas
            testId="resumen-pedidos"
            lead={
              <MenuDesplegable
                alineacion="left"
                ariaLabel="Período de los indicadores"
                trigger={
                  <span data-testid="kpi-periodo" className="inline-flex min-h-11 items-center gap-1 rounded-lg px-1.5 text-xs font-semibold text-fore lg:min-h-9">
                    {PERIODOS.find(([id]) => id === periodo)?.[1] || 'Hoy'}
                    <Icon name="chevron" className="h-3.5 w-3.5" />
                  </span>
                }
                items={PERIODOS.map(([id, label]) => ({ id, label, extra: periodo === id ? <span aria-hidden="true">✓</span> : null, onClick: () => setPeriodo(id) }))}
              />
            }
            items={[
              { titulo: 'Pedidos', valor: kpis.pedidos.total, alcance: 'En pantalla', grafico: kpis.pedidos.serie },
              { titulo: 'Artículos', valor: kpis.articulos.total, alcance: 'En pantalla', grafico: kpis.articulos.serie },
              { titulo: 'Devoluciones', valor: kpis.devoluciones.total, alcance: 'En pantalla', grafico: kpis.devoluciones.serie },
              { titulo: 'Preparados', valor: kpis.preparados.total, alcance: 'En pantalla', grafico: kpis.preparados.serie },
              { titulo: 'Entregados', valor: kpis.entregados.total, alcance: 'En pantalla', grafico: kpis.entregados.serie },
            ]}
          />
        )}
        <SellerFeedback {...data} empty={false} />
        {!data.loading && !data.error && !rows.length && (
          <EmptyState
            icon="box"
            title="No hay pedidos en esta vista."
            description="Las ventas del POS aparecen aquí. Prueba otra búsqueda o cambia el filtro."
            action={<Button onClick={() => navigate('/pos')}>Nueva venta</Button>}
          />
        )}
        {!data.loading &&
          !data.error &&
          (angosta ? (
            // #313 · móvil: una tarjeta por pedido, sin tabla comprimida.
            <div className="ventas-f3-list" data-testid="pedidos-tabla">
              {rows.map(row => (
                <FilaPedido
                  key={row.id}
                  row={row}
                  v2={v2}
                  angosta
                  onClick={() => abrirPedido(row)}
                  onCobrar={() => cobrarPedido(row)}
                  onAcciones={() => setPedidoPanel(row)}
                />
              ))}
            </div>
          ) : (
            <div className="ventas-f3-list" data-testid="pedidos-tabla">
              <div className={cn(GRID, 'ventas-f3-list-header')}>
                {encabezado('number', 'Pedido')}
                {encabezado('date', 'Fecha')}
                {encabezado('customer', 'Cliente / artículos')}
                {encabezado('delivery', 'Canal')}
                {encabezado('payment', 'Pago')}
                {encabezado('fulfillment', 'Estado')}
                {encabezado('total', 'Total', 'justify-end')}
                <span aria-hidden="true" />
              </div>
              <div>
                {rows.map(row => (
                  <FilaPedido
                    key={row.id}
                    row={row}
                    v2={v2}
                    onClick={() => abrirPedido(row)}
                    onCobrar={() => cobrarPedido(row)}
                    onAcciones={() => setPedidoPanel(row)}
                  />
                ))}
              </div>
            </div>
          ))}
        {!data.loading && !data.error && rows.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-1 text-xs text-mute" data-testid="pedidos-paginacion">
            <span>{rows.length} pedido{rows.length === 1 ? '' : 's'}{data.hayMas ? ' cargados' : ''}</span>
            {data.hayMas && (
              <button
                type="button"
                disabled={data.cargandoMas}
                onClick={data.cargarMas}
                className="min-h-11 rounded-lg border border-ink-500 px-3 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore disabled:opacity-60 lg:min-h-9"
              >
                {data.cargandoMas ? 'Cargando…' : 'Cargar más'}
              </button>
            )}
          </div>
        )}
        {pedidoPanel && !detalleAbierto && (
          <VistaRapidaPedido
            row={pedidoPanel}
            onClose={() => setPedidoPanel(null)}
            onAbrir={() => {
              const seleccionado = pedidoPanel
              setPedidoPanel(null)
              abrirPedido(seleccionado)
            }}
            onCobrar={() => {
              const seleccionado = pedidoPanel
              setPedidoPanel(null)
              cobrarPedido(seleccionado)
            }}
          />
        )}
      </SellerSection>
    </div>
  )
}
