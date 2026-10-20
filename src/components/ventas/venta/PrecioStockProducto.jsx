import { gs, num } from '@/utils/calculos'

const montoDel = (info) => {
  if (!info) return null
  if (info.currency === 'USD') return Number(info.unitPriceUsd)
  return Number(info.unitPricePygFallback ?? info.unitPricePyg)
}

const monedaDel = (info) => info?.currency === 'USD'
  ? `USD ${Number(info.unitPriceUsd || 0).toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  : gs(montoDel(info) || 0)

function origenDel(info) {
  if (info?.origin === 'TIER') return `Escalón ${info.minQty || 1}+${info.priceList?.name ? ` · ${info.priceList.name}` : ''}`
  if (info?.origin === 'LIST') return info.priceList?.name ? `Lista ${info.priceList.name}` : 'Lista de precios'
  if (info?.origin === 'WHOLESALE') return 'Mayorista'
  if (info?.origin === 'USD') return 'Precio en dólares'
  return 'Minorista'
}

function nombreSucursal(branchId, sucursales) {
  return sucursales.find(branch => branch.id === branchId)?.nombre
    || sucursales.find(branch => branch.id === branchId)?.name
    || 'Otra sucursal'
}

export default function PrecioStockProducto({ productos = [], precios = {}, cargando = false, sucursal = null, sucursales = [], compacto = false }) {
  const candidatos = productos.map(producto => ({ producto, info: precios[producto.id] })).filter(item => item.info)
  const monedas = new Set(candidatos.map(({ info }) => info.currency || 'PYG'))
  const precioUnico = productos.length === 1 ? candidatos[0] : null
  const precioMinimo = productos.length > 1 && monedas.size === 1
    ? candidatos.reduce((menor, actual) => montoDel(actual.info) < montoDel(menor.info) ? actual : menor, candidatos[0])
    : null

  const stock = new Map()
  for (const producto of productos) {
    const branchId = producto.branchId || '__shared__'
    const actual = stock.get(branchId) || { nombre: branchId === '__shared__' ? 'General' : nombreSucursal(branchId, sucursales), cantidad: 0 }
    actual.cantidad += num(producto.stock)
    stock.set(branchId, actual)
  }
  if (sucursal?.id && !stock.has(sucursal.id)) stock.set(sucursal.id, { nombre: sucursal.nombre || sucursal.name || 'Esta sucursal', cantidad: 0 })
  const filasStock = [...stock.entries()].sort(([a], [b]) => {
    if (a === sucursal?.id) return -1
    if (b === sucursal?.id) return 1
    if (a === '__shared__') return -1
    if (b === '__shared__') return 1
    return 0
  })
  const resumen = filasStock.map(([, fila]) => `${fila.nombre}: ${fila.cantidad}`).join(' · ')
  const stockTotal = filasStock.reduce((total, [, fila]) => total + fila.cantidad, 0)

  return (
    <div className={compacto ? 'min-w-0 flex-1' : 'col-span-2 min-w-0 space-y-1'}>
      <div className="min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-mute">{productos.length > 1 ? 'Desde precio aplicable' : 'Precio aplicable'}</span>
        {precioUnico ? (
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5" data-testid="pos-precio-aplicable">
            <b className="text-sm font-bold tabular-nums text-fore">{monedaDel(precioUnico.info)}</b>
            <span className="text-[10px] text-mute">{origenDel(precioUnico.info)}</span>
          </span>
        ) : precioMinimo ? (
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5" data-testid="pos-precio-aplicable">
            <b className="text-sm font-bold tabular-nums text-fore">{monedaDel(precioMinimo.info)}</b>
            <span className="text-[10px] text-mute">{origenDel(precioMinimo.info)} · elegí la variante</span>
          </span>
        ) : (
          <span className="block text-[11px] text-mute" data-testid="pos-precio-aplicable">
            {cargando ? 'Consultando precio…' : productos.length > 1 ? 'Elegí la variante para ver su precio' : 'Precio al agregar'}
          </span>
        )}
      </div>
      <div className="min-w-0" data-testid="pos-stock-por-sucursal" aria-label={`Stock por sucursal: ${resumen || 'sin datos'}`}>
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-mute">Stock por sucursal</span>
        {stockTotal <= 0 && <span className="block text-[11px] font-semibold text-bad">Agotado</span>}
        <div className="flex min-w-0 flex-wrap gap-x-2 text-[10px] tabular-nums">
          {filasStock.map(([id, fila]) => (
            <span key={id} className={id === sucursal?.id ? 'font-semibold text-ok' : 'text-mute'}>
              {fila.nombre}: {fila.cantidad}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
