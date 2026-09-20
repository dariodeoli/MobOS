import { useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { getProductos } from '@/lib/storage'
import { gs } from '@/utils/calculos'
import { Badge, Button, Input, Select } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'
import { SellerFeedback, SellerSection, useSellerData } from './SellerData'
import { useBusquedaDiferida } from '@/hooks/useBusquedaDiferida'
import ProductoDetalle from '@/components/productos/ProductoDetalle'
import ListGridToggle from '@/components/shared/ListGridToggle'
import ComboManager from '@/components/productos/ComboManager'
import ImportarProductosCSV from './ImportarProductosCSV'
import BarraLote from '@/components/shared/BarraLote'
import EtiquetasProductoModal from '@/components/shared/EtiquetasProductoModal'
import { alternarId, seleccionarTodos } from '@/lib/seleccionLote'
import { useToast } from '@/components/ui'

export const productFields = (row) => ({ ...row, id: row.id, name: row.name || row.nombre || '', sku: row.sku || '', price: row.pricePyg ?? row.precioVenta, stock: row.stock })
const demoProducts = () => getProductos().filter((row) => row.activo !== false)

const CONDITION = { NEW: 'Nuevo', USED: 'Seminuevo', REFURBISHED: 'Reacondicionado' }
const CONDITION_TONE = { NEW: 'green', USED: 'orange', REFURBISHED: 'slate' }
const precio = (row) => Number(row?.pricePyg ?? row?.precioVenta ?? 0)
const mayorista = (row) => Number(row?.wholesalePricePyg ?? 0)
const usd = (row) => Number(row?.priceUsd ?? 0)

// Tabla compacta del catálogo: una fila por producto, encabezados ordenables y
// el precio/stock siempre en la misma columna.
const GRID_CATALOGO = 'grid min-w-[61rem] grid-cols-[1.5rem_minmax(9rem,1.6fr)_7rem_6.5rem_8rem_6.5rem_5.5rem_7rem_4.5rem] items-center gap-x-2'
const usdTexto = (row) => usd(row) > 0 ? `US$ ${usd(row).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—'

function FilaProducto({ row, onClick, seleccionado = false, onAlternar }) {
  const stock = Number(row.stock ?? 0)
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="producto-fila"
      onClick={onClick}
      onKeyDown={(event) => { if (event.key === 'Enter') onClick?.() }}
      className={cn(GRID_CATALOGO, 'cursor-pointer rounded-xl border border-fore/10 bg-ink-800/40 px-3.5 py-2 transition hover:border-fono/40 hover:bg-ink-700/50')}
    >
      <span className="flex items-center" onClick={(event) => event.stopPropagation()}>
        <input type="checkbox" className="h-4 w-4 accent-fono" aria-label={`Seleccionar ${row.name || 'producto'}`} checked={seleccionado} onChange={() => onAlternar?.()} />
      </span>
      <span className="truncate text-sm font-semibold" title={row.name}>{row.name}</span>
      <span className="truncate text-[11px] text-mute" title={row.category || undefined}>{row.category || '—'}</span>
      <Badge color={CONDITION_TONE[row.condition] || 'slate'} className="w-fit justify-self-start whitespace-nowrap px-1.5 py-0.5 text-[10px]">{CONDITION[row.condition] || 'Nuevo'}</Badge>
      <span className="truncate font-mono text-[11px] text-mute" title={row.sku || undefined}>{row.sku || 'Sin SKU'}</span>
      <span className="truncate text-right text-[11px] tabular-nums text-mute">{mayorista(row) > 0 ? gs(mayorista(row)) : '—'}</span>
      <span className="truncate text-right text-[11px] tabular-nums text-mute">{usdTexto(row)}</span>
      <span className="truncate text-right text-sm font-bold tabular-nums text-fore">{precio(row) > 0 ? gs(precio(row)) : '—'}</span>
      <span className={cn('justify-self-end rounded-md border px-1.5 py-0.5 text-[10px] font-bold tabular-nums', stock > 0 ? 'border-ok/25 bg-ok/10 text-ok' : 'border-ink-500 bg-ink-700/40 text-mute')}>{stock}</span>
    </div>
  )
}

// Tarjeta compacta para la vista de cuadrícula.
function TarjetaProducto({ row, onClick }) {
  const stock = Number(row.stock ?? 0)
  return (
    <button type="button" onClick={onClick} className="group flex w-full flex-col rounded-2xl border border-fore/10 bg-ink-800/40 p-4 text-left transition hover:border-fono/40 hover:bg-ink-700/50">
      <span className="flex items-start justify-between gap-2">
        <b className="min-w-0 truncate text-sm">{row.name}</b>
        <Badge color={CONDITION_TONE[row.condition] || 'slate'}>{CONDITION[row.condition] || 'Nuevo'}</Badge>
      </span>
      <span className="mt-1 block truncate font-mono text-[11px] text-mute">{row.sku || 'Sin SKU'}{row.category ? ` · ${row.category}` : ''}</span>
      <span className="mt-3 text-xl font-bold tabular-nums text-fono-light">{precio(row) > 0 ? gs(precio(row)) : '—'}</span>
      {mayorista(row) > 0 && <span className="mt-0.5 text-[11px] text-mute">Mayorista {gs(mayorista(row))}</span>}
      {usd(row) > 0 && <span className="mt-0.5 text-[11px] text-mute">US$ {usd(row).toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>}
      <span className="mt-3 flex items-center justify-between">
        <span className={cn('rounded-md border px-2 py-0.5 text-[10px] font-bold', stock > 0 ? 'border-ok/25 bg-ok/10 text-ok' : 'border-ink-500 bg-ink-700/40 text-mute')}>{stock} en stock</span>
        <Icon name="chevron" className="h-3.5 w-3.5 -rotate-90 text-mute transition group-hover:text-fono-light" />
      </span>
    </button>
  )
}

export default function SellerCatalog() {
  const { esDemo, sesion, usuario } = useSesion()
  const toast = useToast()
  const [seleccionados, setSeleccionados] = useState([])
  const esOwner = Boolean(sesion?.esPropietario || usuario?.role === 'ADMIN')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const busquedaDiferida = useBusquedaDiferida(query)
  const [categoria, setCategoria] = useState('todas')
  const [condicion, setCondicion] = useState('todas')
  const [soloStock, setSoloStock] = useState(false)
  const [orden, setOrden] = useState({ key: 'recientes', dir: 'asc' })
  const [vista, setVista] = useState(() => localStorage.getItem('mobos:productos-vista') || 'list')
  const [seleccion, setSeleccion] = useState(null)
  const [combosOpen, setCombosOpen] = useState(false)
  const [etiquetasOpen, setEtiquetasOpen] = useState(false)
  const searchRef = useRef(null)
  useEffect(() => { setSearch(busquedaDiferida.trim()) }, [busquedaDiferida])
  const data = useSellerData(`/api/products?q=${encodeURIComponent(search)}`, productFields, demoProducts, esDemo, { limit: 50 })
  const canManage = Boolean(sesion?.esPropietario || ['ADMIN', 'GERENTE'].includes(sesion?.rol) || ['ADMIN', 'GERENTE'].includes(usuario?.role))
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return data.rows
      .filter((row) => esDemo ? `${row.name} ${row.sku}`.toLowerCase().includes(q) : true)
      .filter((row) => categoria === 'todas' || row.category === categoria)
      .filter((row) => condicion === 'todas' || row.condition === condicion)
      .filter((row) => !soloStock || Number(row.stock ?? 0) > 0)
  }, [data.rows, search, categoria, condicion, soloStock, esDemo])
  const categorias = useMemo(() => [...new Set(data.rows.map(row => row.category).filter(Boolean))].sort(), [data.rows])
  const ordenarPor = (key) => setOrden(current => current.key === key
    ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: ['mayorista', 'usd', 'precio', 'stock'].includes(key) ? 'desc' : 'asc' })
  const encabezado = (key, label, extra = '') => (
    <button type="button" onClick={() => ordenarPor(key)} className={cn('flex items-center gap-1 truncate text-left text-[10px] font-bold uppercase tracking-wider transition hover:text-fore', orden.key === key ? 'text-fono-light' : 'text-mute', extra)}>
      {label}<span className="shrink-0">{orden.key === key ? (orden.dir === 'asc' ? '↑' : '↓') : ''}</span>
    </button>
  )
  const valorOrden = (row, key) => {
    if (key === 'producto') return String(row.name || '')
    if (key === 'categoria') return String(row.category || '')
    if (key === 'condicion') return String(row.condition || '')
    if (key === 'sku') return String(row.sku || '')
    if (key === 'mayorista') return mayorista(row)
    if (key === 'usd') return usd(row)
    if (key === 'precio') return precio(row)
    if (key === 'stock') return Number(row.stock ?? 0)
    return 0
  }
  const ordenadas = useMemo(() => {
    if (orden.key === 'recientes') return rows
    const factor = orden.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const va = valorOrden(a, orden.key); const vb = valorOrden(b, orden.key)
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb), 'es') * factor
      return (va - vb) * factor
    })
  }, [rows, orden])
  useEffect(() => {
    if (window.__mobosFocusSearch) {
      delete window.__mobosFocusSearch
      searchRef.current?.focus()
    }
    function onFocusSearch() {
      delete window.__mobosFocusSearch
      searchRef.current?.focus()
    }
    window.addEventListener('mobos:focus-search', onFocusSearch)
    return () => window.removeEventListener('mobos:focus-search', onFocusSearch)
  }, [])
  function vender(producto) {
    try { sessionStorage.setItem('mobos:venta-handoff', JSON.stringify({ productId: producto.id, ts: Date.now() })) } catch { /* la venta sigue disponible sin preselección */ }
    window.location.assign('/pos/cargar')
  }
  const elegidos = () => ordenadas.filter((row) => seleccionados.includes(row.id))
  async function copiarPrecios() {
    const texto = elegidos().map((row) => `${row.name} · ${precio(row) > 0 ? gs(precio(row)) : 'sin precio'} · stock ${Number(row.stock || 0)}`).join('\n')
    try { await navigator.clipboard.writeText(texto); toast.success(`${elegidos().length} producto(s) copiados.`) } catch { toast.error('No se pudo copiar la lista.') }
  }
  function exportarSeleccionados() {
    const lista = elegidos()
    const filasCsv = [['Nombre', 'SKU', 'Categoría', 'Condición', 'Precio', 'Mayorista', 'USD', 'Stock'], ...lista.map((row) => [row.name || '', row.sku || '', row.category || '', CONDITION[row.condition] || 'Nuevo', String(precio(row)), String(mayorista(row)), String(usd(row)), String(Number(row.stock || 0))])]
    const csv = filasCsv.map((fila) => fila.map((celda) => `"${String(celda).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }))
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = 'mobos-productos-seleccionados.csv'
    enlace.click()
    URL.revokeObjectURL(url)
    toast.success(`${lista.length} producto(s) exportados.`)
  }

  return <SellerSection description="Catálogo de consulta y edición: precio, mayorista, stock y equipos por IMEI.">
    <div className="flex flex-wrap items-center gap-2">
      <form className="flex min-w-[220px] flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); setSearch(busquedaDiferida.trim()) }}>
        <div className="relative min-w-0 flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
          <Input ref={searchRef} aria-label="Buscar productos" className="pl-9" placeholder="Nombre o SKU" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <Button>Buscar</Button>
      </form>
      <Select aria-label="Filtrar por categoría" className="w-auto" value={categoria} onChange={(event) => setCategoria(event.target.value)}><option value="todas">Todas las categorías</option>{categorias.map(item => <option key={item} value={item}>{item}</option>)}</Select>
      <Select aria-label="Filtrar por condición" className="w-auto" value={condicion} onChange={(event) => setCondicion(event.target.value)}><option value="todas">Nueva y seminueva</option><option value="NEW">Nuevos</option><option value="USED">Seminuevos</option><option value="REFURBISHED">Reacondicionados</option></Select>
      <button type="button" onClick={() => setSoloStock(value => !value)} className={cn('rounded-lg border px-3 py-2 text-xs font-semibold transition', soloStock ? 'border-ok/40 bg-ok/10 text-ok' : 'border-ink-500 text-mute hover:border-fono hover:text-fore')}>Con stock</button>
      <ListGridToggle value={vista} onChange={(next) => { setVista(next); localStorage.setItem('mobos:productos-vista', next) }} />
      <button type="button" onClick={data.refresh} disabled={data.loading} className="rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore">Actualizar</button>
      {canManage && !esDemo && <button type="button" onClick={() => setCombosOpen(true)} className="rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore">Combos</button>}
      {esOwner && !esDemo && <ImportarProductosCSV onImportada={data.refresh} />}
    </div>
    <SellerFeedback {...data} empty={!rows.length} />
    <BarraLote cantidad={seleccionados.length} onLimpiar={() => setSeleccionados([])}>
      <button type="button" className="rounded-lg border border-ink-500 px-2 py-1 text-xs font-semibold transition hover:text-fore" onClick={() => setEtiquetasOpen(true)}>Etiquetas</button>
      <button type="button" className="rounded-lg border border-ink-500 px-2 py-1 text-xs font-semibold transition hover:text-fore" onClick={copiarPrecios}>Copiar precios</button>
      <button type="button" className="rounded-lg border border-ink-500 px-2 py-1 text-xs font-semibold transition hover:text-fore" onClick={exportarSeleccionados}>Exportar CSV</button>
    </BarraLote>
    {!data.loading && !data.error && vista === 'list' && <div className="overflow-x-auto" data-testid="catalogo-tabla">
      <div className={cn(GRID_CATALOGO, 'px-3.5 pb-2 pt-1')}>
        <input type="checkbox" className="h-4 w-4 accent-fono" aria-label="Seleccionar visibles" title="Seleccionar visibles" checked={ordenadas.length > 0 && seleccionados.length === ordenadas.length} onChange={() => setSeleccionados((actuales) => seleccionarTodos(ordenadas, actuales))} />
        {encabezado('producto', 'Producto')}
        {encabezado('categoria', 'Categoría')}
        {encabezado('condicion', 'Condición')}
        {encabezado('sku', 'SKU')}
        {encabezado('mayorista', 'Mayorista', 'justify-end')}
        {encabezado('usd', 'USD', 'justify-end')}
        {encabezado('precio', 'Precio', 'justify-end')}
        {encabezado('stock', 'Stock', 'justify-end')}
      </div>
      <div className="space-y-1">{ordenadas.map((row) => <FilaProducto key={row.id} row={row} onClick={() => setSeleccion(row)} seleccionado={seleccionados.includes(row.id)} onAlternar={() => setSeleccionados((actuales) => alternarId(actuales, row.id))} />)}</div>
    </div>}
    {!data.loading && !data.error && vista === 'grid' && <div className="grid gap-3 sm:grid-cols-2 min-[1200px]:grid-cols-3">{rows.map((row) => <TarjetaProducto key={row.id} row={row} onClick={() => setSeleccion(row)} />)}</div>}
    {!data.loading && !data.error && data.hayMas && <div className="flex justify-center pt-1"><button type="button" disabled={data.cargandoMas} onClick={data.cargarMas} className="rounded-lg border border-ink-500 px-4 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore disabled:opacity-60">{data.cargandoMas ? 'Cargando…' : 'Cargar más productos'}</button></div>}
    <ComboManager open={combosOpen} onClose={() => setCombosOpen(false)} />
    <EtiquetasProductoModal open={etiquetasOpen} onClose={() => setEtiquetasOpen(false)} productos={rows} seleccionInicial={seleccionados} />
    {seleccion && <ProductoDetalle product={seleccion} canManage={canManage} esDemo={esDemo} onClose={() => setSeleccion(null)} onChanged={data.refresh} onSell={vender} />}
  </SellerSection>
}
