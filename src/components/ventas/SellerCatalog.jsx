import { useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { getProductos } from '@/lib/storage'
import { gs } from '@/utils/calculos'
import { Badge, Button, Input, Select } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'
import { SellerFeedback, SellerSection, useSellerData } from './SellerData'
import ProductoDetalle from '@/components/productos/ProductoDetalle'
import ListGridToggle from '@/components/shared/ListGridToggle'

export const productFields = (row) => ({ ...row, id: row.id, name: row.name || row.nombre || '', sku: row.sku || '', price: row.pricePyg ?? row.precioVenta, stock: row.stock })
const demoProducts = () => getProductos().filter((row) => row.activo !== false)

const CONDITION = { NEW: 'Nuevo', USED: 'Seminuevo', REFURBISHED: 'Reacondicionado' }
const CONDITION_TONE = { NEW: 'green', USED: 'orange', REFURBISHED: 'slate' }
const precio = (row) => Number(row?.pricePyg ?? row?.precioVenta ?? 0)
const mayorista = (row) => Number(row?.wholesalePricePyg ?? 0)

// Fila compacta: nombre, SKU/categoría, condición, precio y stock en una línea.
function FilaProducto({ row, onClick }) {
  const stock = Number(row.stock ?? 0)
  return (
    <button type="button" onClick={onClick} className="group flex w-full items-center gap-2.5 rounded-xl border border-fore/10 bg-ink-800/40 px-3.5 py-2.5 text-left transition hover:border-fono/40 hover:bg-ink-700/50">
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <b className="truncate text-sm">{row.name}</b>
          <Badge color={CONDITION_TONE[row.condition] || 'slate'}>{CONDITION[row.condition] || 'Nuevo'}</Badge>
          {row.category && <span className="truncate text-[11px] text-mute">{row.category}</span>}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[11px] text-mute">{row.sku || 'Sin SKU'}{mayorista(row) > 0 ? ` · mayorista ${gs(mayorista(row))}` : ''}</span>
      </span>
      <span className="flex shrink-0 items-center gap-3">
        <span className={cn('rounded-md border px-2 py-0.5 text-[10px] font-bold', stock > 0 ? 'border-ok/25 bg-ok/10 text-ok' : 'border-ink-500 bg-ink-700/40 text-mute')}>{stock} en stock</span>
        <span className="w-24 shrink-0 text-right text-sm font-bold tabular-nums">{precio(row) > 0 ? gs(precio(row)) : '—'}</span>
        <Icon name="chevron" className="h-3.5 w-3.5 -rotate-90 text-mute transition group-hover:text-fono-light" />
      </span>
    </button>
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
      <span className="mt-3 flex items-center justify-between">
        <span className={cn('rounded-md border px-2 py-0.5 text-[10px] font-bold', stock > 0 ? 'border-ok/25 bg-ok/10 text-ok' : 'border-ink-500 bg-ink-700/40 text-mute')}>{stock} en stock</span>
        <Icon name="chevron" className="h-3.5 w-3.5 -rotate-90 text-mute transition group-hover:text-fono-light" />
      </span>
    </button>
  )
}

export default function SellerCatalog() {
  const { esDemo, sesion, usuario } = useSesion()
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [categoria, setCategoria] = useState('todas')
  const [condicion, setCondicion] = useState('todas')
  const [soloStock, setSoloStock] = useState(false)
  const [vista, setVista] = useState(() => localStorage.getItem('mobos:productos-vista') || 'list')
  const [seleccion, setSeleccion] = useState(null)
  const searchRef = useRef(null)
  const data = useSellerData(`/api/products?q=${encodeURIComponent(search)}`, productFields, demoProducts, esDemo)
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
  return <SellerSection title="Productos" description="Catálogo de consulta y edición: precio, mayorista, stock y equipos por IMEI.">
    <div className="flex flex-wrap items-center gap-2">
      <form className="flex min-w-[220px] flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); data.refresh() }}>
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
    </div>
    <SellerFeedback {...data} empty={!rows.length} />
    {!data.loading && !data.error && vista === 'list' && <div className="space-y-2">{rows.map((row) => <FilaProducto key={row.id} row={row} onClick={() => setSeleccion(row)} />)}</div>}
    {!data.loading && !data.error && vista === 'grid' && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{rows.map((row) => <TarjetaProducto key={row.id} row={row} onClick={() => setSeleccion(row)} />)}</div>}
    {seleccion && <ProductoDetalle product={seleccion} canManage={canManage} esDemo={esDemo} onClose={() => setSeleccion(null)} onChanged={data.refresh} onSell={vender} />}
  </SellerSection>
}
