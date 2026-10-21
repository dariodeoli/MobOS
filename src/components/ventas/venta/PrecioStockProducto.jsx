import { gs } from '@/utils/calculos'

function amount(info) {
  const value = info?.currency === 'USD' ? info.unitPriceUsd : info?.unitPricePygFallback ?? info?.unitPricePyg
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}
function source(info) {
  if (info.origin === 'TIER') return `Escalón ${info.minQty || 1}+${info.priceList?.name ? ` · ${info.priceList.name}` : ''}`
  if (info.origin === 'LIST') return info.priceList?.name ? `Lista ${info.priceList.name}` : 'Lista de precios'
  if (info.origin === 'WHOLESALE') return 'Mayorista'
  if (info.origin === 'USD') return 'Precio en dólares'
  return 'Minorista'
}

/** Quotes are for one unit; stock only describes rows in the permitted catalog. */
export default function PrecioStockProducto({ productos = [], precios = {}, cargando = false, sucursal = null, sucursales = [], compacto = false }) {
  const quotes = productos.map(product => precios[product.id])
  const complete = quotes.length > 0 && quotes.every(info => amount(info) !== null && ['PYG', 'USD'].includes(info?.currency) && ['TIER', 'LIST', 'WHOLESALE', 'RETAIL', 'USD'].includes(info.origin))
  const comparable = complete && new Set(quotes.map(info => info.currency)).size === 1
  const quote = comparable ? quotes.reduce((lowest, info) => amount(info) < amount(lowest) ? info : lowest) : null
  const branches = new Map()
  for (const product of productos) {
    const id = product.branchId || '__general__'
    const name = id === '__general__' ? 'General' : sucursales.find(row => row.id === id)?.nombre || sucursales.find(row => row.id === id)?.name || (sucursal?.id === id ? sucursal.nombre || sucursal.name : '') || 'Sucursal del catálogo'
    const stock = typeof product.stock === 'number' && Number.isFinite(product.stock) && product.stock >= 0 ? product.stock : null
    const previous = branches.get(id)
    branches.set(id, { name, stock: stock === null || previous?.stock === null ? null : stock + (previous?.stock || 0) })
  }
  const rows = [...branches.entries()].sort(([a], [b]) => Number(b === sucursal?.id) - Number(a === sucursal?.id))
  return (
    <span className={compacto ? 'block min-w-0 space-y-1' : 'col-span-2 block min-w-0 space-y-1'}>
      <span className="block text-xs" data-testid="pos-precio-aplicable" aria-busy={cargando}>
        {cargando ? <span className="text-mute">Consultando precio…</span> : quote ? <>
          <b className="font-semibold tabular-nums text-fore">{productos.length > 1 ? 'Desde ' : ''}{quote.currency === 'USD' ? `USD ${amount(quote).toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : gs(amount(quote))}</b>
          <span className="block break-words text-mute">{source(quote)} · 1 unidad{productos.length > 1 ? ' · elegí variante' : ''}</span>
        </> : <span className="text-mute">{complete ? 'Elegí variante para ver el precio' : 'Precio no disponible'}</span>}
      </span>
      <span className="block text-xs text-mute" data-testid="pos-stock-por-sucursal">
        <span className="block">Stock por sucursal</span>
        {rows.map(([id, row]) => <span key={id} className={`block break-words tabular-nums ${id === sucursal?.id ? 'font-semibold text-fore' : ''}`}>{row.name}: {row.stock === null ? 'Sin dato' : row.stock === 0 ? 'Agotado' : row.stock}</span>)}
      </span>
    </span>
  )
}
