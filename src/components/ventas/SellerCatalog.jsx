import { useEffect, useRef, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { getProductos } from '@/lib/storage'
import { gs } from '@/utils/calculos'
import { Button, Input } from '@/components/ui'
import { SellerFeedback, SellerSection, useSellerData } from './SellerData'

export const productFields = (row) => ({ id: row.id, name: row.name || row.nombre || '', sku: row.sku || '', price: row.pricePyg ?? row.precioVenta, stock: row.stock })
const demoProducts = () => getProductos().filter((row) => row.activo !== false)

export default function SellerCatalog() {
  const { esDemo } = useSesion()
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const searchRef = useRef(null)
  const data = useSellerData(`/api/products?q=${encodeURIComponent(search)}`, productFields, demoProducts, esDemo)
  const rows = esDemo ? data.rows.filter((row) => `${row.name} ${row.sku}`.toLowerCase().includes(search.toLowerCase())) : data.rows
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
  return <SellerSection title="Productos" description="Catálogo de consulta: precio de venta y stock. Buscá para acotar los resultados (hasta 100 por consulta).">
    <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); data.refresh() }}>
      <Input ref={searchRef} aria-label="Buscar productos" placeholder="Nombre o SKU" value={query} onChange={(event) => setQuery(event.target.value)} />
      <Button>Buscar</Button>
    </form>
    <SellerFeedback {...data} empty={!rows.length} />
    {!data.loading && !data.error && <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{rows.map((row) => <li key={row.id} className="min-w-0 break-words rounded-2xl border border-fore/10 bg-fore/[.02] p-5">
      <h2 className="font-semibold">{row.name}</h2><p className="mt-1 text-xs text-mute">SKU: {row.sku || 'No disponible'}</p>
      <p className="mt-4 text-xl font-semibold text-fono-light">{row.price != null && Number.isFinite(Number(row.price)) ? gs(row.price) : 'Precio no disponible'}</p>
      <p className="mt-2 text-sm text-mute">Stock: {row.stock ?? 'No disponible'}</p>
    </li>)}</ul>}
  </SellerSection>
}
