import { gs } from '@/utils/calculos'
import { cn } from '@/lib/utils'

const CONDICION = { NEW: 'Nuevo', USED: 'Seminuevo', REFURBISHED: 'Reacondicionado' }

function amount(info) {
  const value = info?.currency === 'USD' ? info.unitPriceUsd : info?.unitPricePygFallback ?? info?.unitPricePyg
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}
/** Quotes are for one unit; stock only describes rows in the permitted catalog. */
export default function PrecioStockProducto({ productos = [], precios = {}, cargando = false, sucursal = null, sucursales = [], compacto = false, fila = false }) {
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
  // Stock por condición en la sucursal de la venta (o en todo el catálogo
  // mostrado si ninguna variante es de esa sucursal). Solo las condiciones que
  // existen en la familia; sin dato de condición cuenta como Nuevo.
  const enSucursal = productos.filter(product => !sucursal?.id || !product.branchId || product.branchId === sucursal.id)
  const baseCondicion = enSucursal.length ? enSucursal : productos
  const porCondicion = new Map()
  for (const product of baseCondicion) {
    const clave = product.condition || product.condicion || 'NEW'
    const stock = typeof product.stock === 'number' && Number.isFinite(product.stock) && product.stock >= 0 ? product.stock : 0
    porCondicion.set(clave, (porCondicion.get(clave) || 0) + stock)
  }
  const condiciones = ['NEW', 'USED', 'REFURBISHED'].filter(clave => porCondicion.has(clave))
    .concat([...porCondicion.keys()].filter(clave => !['NEW', 'USED', 'REFURBISHED'].includes(clave)))
  const textoCondicion = condiciones.map(clave => `${CONDICION[clave] || clave} ${porCondicion.get(clave)}`).join(' · ')
  const textoSucursal = row => `${row.name}: ${row.stock === null ? 'Sin dato' : row.stock === 0 ? 'Agotado' : row.stock}`
  const precio = (
    <span data-testid="pos-precio-aplicable" aria-busy={cargando} className="min-w-0 break-words">
      {cargando ? <span className="text-mute">Consultando precio…</span> : quote ? (
        <b className="font-semibold tabular-nums text-fore">{productos.length > 1 ? 'Desde ' : ''}{quote.currency === 'USD' ? `USD ${amount(quote).toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : gs(amount(quote))}</b>
      ) : <span className="text-mute">{complete ? 'Precio según variante' : 'Precio no disponible'}</span>}
    </span>
  )
  const stockSucursal = (
    <span data-testid="pos-stock-por-sucursal" className="inline-flex min-w-0 flex-wrap gap-x-2 text-mute">
      {rows.map(([id, row]) => <span key={id} className={`break-words tabular-nums ${id === sucursal?.id ? 'font-semibold text-fore' : ''}`}>{textoSucursal(row)}</span>)}
    </span>
  )
  const stockCondicion = textoCondicion ? <span data-testid="pos-stock-condicion" className="tabular-nums text-mute">{textoCondicion}</span> : null
  // Una sola forma para cuadrícula y lista; la lista la reparte en una línea.
  return (
    <span className={cn('flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0 text-xs', !fila && !compacto && 'col-span-2')}>
      {precio}
      {stockCondicion}
      {stockSucursal}
    </span>
  )
}
