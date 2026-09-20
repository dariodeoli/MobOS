import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { resources } from '@/lib/api'
import { getProductos } from '@/lib/storage'
import { num } from '@/utils/calculos'
import { Badge, Button, Card, EmptyState, IconAction, Input, Label, Modal, MoneyInput, Select, useToast } from '@/components/ui'
import ProductCombobox from '@/components/shared/ProductCombobox'
import PercentField, { formatPercent, parsePercent } from '@/components/shared/PercentField'

// Gestión de precios: listas por cliente (con ítems por producto o categoría y
// descuento/recargo) y precios por cantidad. El POS resuelve con la prioridad
// escalón por cantidad > lista del cliente > mayorista > minorista > USD.
const itemVacio = () => ({ scope: 'PRODUCT', productId: '', category: '', valuePct: '' })
const tierVacio = () => ({ minQuantity: '', unitPricePyg: '' })

export default function Precios() {
  const { sesion, esDemo } = useSesion()
  const toast = useToast()
  const [listas, setListas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [editor, setEditor] = useState(null) // { id?, name, isActive, items }
  const [productoTier, setProductoTier] = useState('')
  const [filasTier, setFilasTier] = useState([])
  const [busy, setBusy] = useState(false)
  const [aBorrar, setABorrar] = useState(null)
  // El catálogo vive en el cache que se hidrata con la sesión; si la pantalla
  // se abre antes (enlace directo), se pide a la API para no quedar vacía.
  const [productos, setProductos] = useState(() => getProductos().filter(p => p.activo !== false))
  useEffect(() => {
    if (productos.length || esDemo) return undefined
    let vivo = true
    resources.products.list().then((filas) => {
      if (!vivo || !Array.isArray(filas)) return
      setProductos(filas.filter(p => p.isActive !== false).map(p => ({ ...p, nombre: p.name, categoria: p.category })))
    }).catch(() => {})
    return () => { vivo = false }
  }, [productos.length, esDemo])
  const categorias = useMemo(() => [...new Set(productos.map(p => p.categoria || p.category).filter(Boolean))].sort(), [productos])
  const gestiona = Boolean(sesion?.esPropietario) || ['ADMIN', 'GERENTE'].includes(sesion?.rol)

  async function cargar() {
    setCargando(true); setError('')
    try {
      const [listasData, productosData] = await Promise.all([
        resources.priceLists.list(),
        resources.products.list().catch(() => null),
      ])
      setListas(Array.isArray(listasData) ? listasData : [])
      fusionarProductos(productosData)
    } catch (cause) { setError(cause?.message || 'No se pudieron cargar los precios.') } finally { setCargando(false) }
  }
  useEffect(() => { if (!esDemo) cargar() }, [esDemo])

  // El catálogo global se hidrata después del montaje: al cambiar la sesión se
  // vuelve a leer el cache para no quedarnos con la foto vacía del arranque.
  useEffect(() => {
    const delCache = getProductos().filter(p => p.activo !== false)
    if (delCache.length) setProductos((actuales) => {
      const porId = new Map(delCache.map(p => [p.id, p]))
      for (const actual of actuales) if (!porId.has(actual.id)) porId.set(actual.id, actual)
      return [...porId.values()]
    })
  }, [sesion])

  // Fusión por id: nunca se pierde un producto ya visible (el catálogo de la
  // API viene paginado y el recién creado puede quedar afuera de la página).
  function fusionarProductos(filas) {
    if (!Array.isArray(filas)) return
    setProductos((actuales) => {
      const porId = new Map(actuales.map(p => [p.id, p]))
      for (const fila of filas) {
        if (fila?.isActive === false) continue
        porId.set(fila.id, { ...porId.get(fila.id), ...fila, nombre: fila.name, categoria: fila.category })
      }
      return [...porId.values()]
    })
  }

  // Al tipear en un buscador de producto se consulta al servidor y se fusiona:
  // así aparecen también los productos creados después de abrir la pantalla.
  async function buscarProductos(texto) {
    if (esDemo || String(texto || '').trim().length < 2) return
    try {
      fusionarProductos(await resources.products.list(texto.trim()))
    } catch { /* la búsqueda del servidor es un extra */ }
  }

  function abrirLista(lista = null) {
    setError('')
    setEditor(lista
      ? { id: lista.id, name: lista.name, isActive: lista.isActive !== false, items: (lista.items || []).map(item => ({ scope: item.scope === 'CATEGORY' ? 'CATEGORY' : 'PRODUCT', productId: item.productId || '', category: item.category || '', valuePct: formatPercent(Number(item.discountPct) || 0) })) }
      : { id: null, name: '', isActive: true, items: [] })
  }
  const nombreProducto = (id) => productos.find(p => p.id === id)?.nombre || productos.find(p => p.id === id)?.name || 'Producto'

  async function guardarLista(event) {
    event.preventDefault()
    if (!editor || busy) return
    const items = []
    for (const item of editor.items) {
      if (item.scope === 'PRODUCT' && !item.productId) return setError('Elegí el producto de cada ítem o quitalo.')
      if (item.scope === 'CATEGORY' && !item.category) return setError('Elegí la categoría de cada ítem o quitalo.')
      const valuePct = parsePercent(item.valuePct)
      if (valuePct === null || valuePct <= 0 || valuePct > 100) return setError('El porcentaje de cada ítem debe estar entre 0 y 100.')
      items.push({ scope: item.scope, productId: item.scope === 'PRODUCT' ? item.productId : null, category: item.scope === 'CATEGORY' ? item.category : null, discountPct: valuePct })
    }
    setBusy(true); setError('')
    try {
      const payload = { name: editor.name.trim(), isActive: editor.isActive, items }
      if (editor.id) await resources.priceLists.update({ id: editor.id, ...payload })
      else await resources.priceLists.create(payload)
      setEditor(null)
      toast.success(editor.id ? 'Lista actualizada.' : 'Lista creada.')
      await cargar()
    } catch (cause) {
      setError(cause?.message || 'No se pudo guardar la lista.')
    } finally { setBusy(false) }
  }

  async function alternarLista(lista) {
    try { await resources.priceLists.update({ id: lista.id, isActive: !lista.isActive }); toast.success(lista.isActive ? 'Lista desactivada.' : 'Lista activada.'); await cargar() } catch (cause) { setError(cause?.message || 'No se pudo cambiar el estado.') }
  }
  async function borrarLista() {
    if (!aBorrar || busy) return
    setBusy(true)
    try { await resources.priceLists.deactivate(aBorrar.id); setABorrar(null); toast.success('Lista eliminada.'); await cargar() } catch (cause) { setError(cause?.message || 'No se pudo eliminar la lista.') } finally { setBusy(false) }
  }

  // Precios por cantidad: al elegir producto se cargan sus escalones desde
  // los ítems de lista que lo apuntan (el escalón vive en el ítem).
  useEffect(() => {
    if (!productoTier) { setFilasTier([]); return }
    const vistos = new Map()
    for (const lista of listas) {
      for (const item of (lista.items || [])) {
        if (item.scope !== 'PRODUCT' || item.productId !== productoTier) continue
        for (const tier of (item.tiers || [])) {
          if (!vistos.has(tier.minQty)) vistos.set(tier.minQty, { minQuantity: String(tier.minQty), unitPricePyg: String(tier.unitPricePyg) })
        }
      }
    }
    setFilasTier([...vistos.values()].sort((a, b) => Number(a.minQuantity) - Number(b.minQuantity)))
  }, [productoTier, listas])

  async function guardarTiers(event) {
    event.preventDefault()
    if (!productoTier || busy) return
    const escalones = []
    for (const fila of filasTier) {
      const minQuantity = Number(fila.minQuantity); const unitPricePyg = num(fila.unitPricePyg)
      if (!Number.isSafeInteger(minQuantity) || minQuantity < 2) { setError('Cada escalón empieza en 2 unidades o más.'); return }
      if (!Number.isSafeInteger(unitPricePyg) || unitPricePyg < 0) { setError('El precio del escalón es inválido.'); return }
      escalones.push({ minQuantity, unitPricePyg })
    }
    setBusy(true); setError('')
    try {
      for (const lista of listas) {
        const itemAfectado = (lista.items || []).find(item => item.scope === 'PRODUCT' && item.productId === productoTier)
        if (!itemAfectado) continue
        const items = (lista.items || []).map(item => {
          if (item.id !== itemAfectado.id) return undefined
          return {
            id: item.id,
            scope: item.scope || 'PRODUCT',
            productId: item.productId,
            category: item.category,
            discountPct: Number(item.discountPct) > 0 ? Number(item.discountPct) : undefined,
            tiers: escalones.map(escalon => ({ minQty: escalon.minQuantity, unitPricePyg: escalon.unitPricePyg })),
          }
        }).filter(Boolean)
        await resources.priceLists.update(lista.id, { items })
      }
      toast.success('Precios por cantidad guardados.')
      await cargar()
    } catch (cause) { setError(cause?.message || 'No se pudieron guardar los escalones.') } finally { setBusy(false) }
  }

  if (esDemo) return <Card><p className="text-sm text-mute">Las listas de precios se configuran con una cuenta real.</p></Card>
  if (!gestiona) return <Card><p className="text-sm text-mute">Solo administración o gerencia configuran precios.</p></Card>

  return <div className="space-y-4">
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">Listas de precios</h2>
          <p className="mt-1 text-sm text-mute">Descuento o recargo por producto o categoría, aplicado sobre el precio que le corresponde al cliente. Se asigna en la ficha del cliente y gana sobre mayorista y minorista.</p>
        </div>
        <Button type="button" onClick={() => abrirLista()} disabled={busy}>+ Nueva lista</Button>
      </div>
      {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      {cargando ? <p className="text-sm text-mute">Cargando listas…</p> : !listas.length ? <EmptyState compact icon="store" title="Todavía no hay listas de precios." /> : <div className="space-y-2">
        {listas.map(lista => <div key={lista.id} data-testid="lista-precio-fila" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-600 bg-ink-800/40 p-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold"><span className="truncate">{lista.name}</span><Badge color={lista.isActive ? 'green' : 'slate'}>{lista.isActive ? 'Activa' : 'Inactiva'}</Badge></p>
            <p className="mt-1 text-xs text-mute">{(lista.items || []).length} ítem{(lista.items || []).length === 1 ? '' : 's'}{(lista.items || []).length ? ` · ${(lista.items || []).slice(0, 3).map(item => item.productId ? nombreProducto(item.productId) : item.category).join(', ')}${(lista.items || []).length > 3 ? '…' : ''}` : ''}</p>
          </div>
          <span className="flex shrink-0 items-center gap-1">
            <IconAction icon="edit" label="Editar lista" onClick={() => abrirLista(lista)} />
            <IconAction icon="refresh" label={lista.isActive ? 'Desactivar lista' : 'Activar lista'} onClick={() => alternarLista(lista)} />
            <IconAction icon="trash" tone="bad" label="Eliminar lista" onClick={() => setABorrar(lista)} />
          </span>
        </div>)}
      </div>}
    </Card>

    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold">Precios por cantidad</h2>
        <p className="mt-1 text-sm text-mute">Desde la cantidad mínima, el precio unitario de la línea es el del escalón. Gana sobre cualquier lista, mayorista o minorista. Cargá el escalón más alto y el resto se resuelve solo.</p>
      </div>
      <div className="max-w-md"><p className="mb-1 text-xs text-mute">Producto</p><ProductCombobox products={productos} selectedId={productoTier} onQueryChange={buscarProductos} onSelect={product => setProductoTier(product.id)} placeholder="Elegí el producto…" /></div>
      {productoTier && <form onSubmit={guardarTiers} className="space-y-2">
        {filasTier.map((fila, index) => <div key={index} className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-mute">Desde<Input aria-label="Cantidad mínima" className="w-24" inputMode="numeric" value={fila.minQuantity} onChange={event => setFilasTier(filas => filas.map((row, i) => i === index ? { ...row, minQuantity: event.target.value.replace(/\D/g, '') } : row))} placeholder="3" /></label>
          <label className="text-xs text-mute">Precio unitario<MoneyInput aria-label="Precio unitario del escalón" className="w-40" value={fila.unitPricePyg} onValueChange={value => setFilasTier(filas => filas.map((row, i) => i === index ? { ...row, unitPricePyg: value === '' ? '' : String(value) } : row))} placeholder="0" /></label>
          <IconAction icon="trash" tone="bad" label="Quitar escalón" onClick={() => setFilasTier(filas => filas.filter((_, i) => i !== index))} />
        </div>)}
        {!filasTier.length && <p className="text-sm text-mute">Sin escalones: el producto se vende con el precio de su lista o del tramo del cliente.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setFilasTier(filas => [...filas, tierVacio()])}>+ Escalón</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar escalones'}</Button>
        </div>
      </form>}
    </Card>

    <Modal open={editor !== null} onClose={() => !busy && setEditor(null)} title={editor?.id ? 'Editar lista de precios' : 'Nueva lista de precios'} className="max-w-3xl">
      {editor && <form onSubmit={guardarLista} className="space-y-4">
        <div className="max-w-md">
          <Label htmlFor="lista-nombre">Nombre</Label><Input id="lista-nombre" required value={editor.name} onChange={event => setEditor(current => ({ ...current, name: event.target.value }))} placeholder="Mayorista VIP, Empresas…" />
        </div>
        <label className="flex items-center gap-2 text-sm text-mute"><input type="checkbox" className="h-4 w-4 accent-fono" checked={editor.isActive} onChange={event => setEditor(current => ({ ...current, isActive: event.target.checked }))} />Lista activa</label>
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-mute">Ítems</p>
          {editor.items.map((item, index) => <div key={index} className="grid gap-2 rounded-xl border border-ink-600 p-2 sm:grid-cols-[7rem_minmax(10rem,1fr)_7rem_2.75rem] sm:items-center">
            <Select aria-label="Tipo de ítem" value={item.scope} onChange={event => setEditor(current => ({ ...current, items: current.items.map((row, i) => i === index ? { ...itemVacio(), scope: event.target.value } : row) }))}><option value="PRODUCT">Producto</option><option value="CATEGORY">Categoría</option></Select>
            {item.scope === 'PRODUCT'
              ? <ProductCombobox products={productos} selectedId={item.productId} onQueryChange={buscarProductos} onSelect={product => setEditor(current => ({ ...current, items: current.items.map((row, i) => i === index ? { ...row, productId: product.id } : row) }))} placeholder="Producto…" />
              : <Select aria-label="Categoría" value={item.category} onChange={event => setEditor(current => ({ ...current, items: current.items.map((row, i) => i === index ? { ...row, category: event.target.value } : row) }))}><option value="">Elegí categoría</option>{categorias.map(categoria => <option key={categoria} value={categoria}>{categoria}</option>)}</Select>}
            <PercentField aria-label="Porcentaje" value={item.valuePct} onChange={value => setEditor(current => ({ ...current, items: current.items.map((row, i) => i === index ? { ...row, valuePct: value } : row) }))} />
            <IconAction icon="trash" tone="bad" label="Quitar ítem" onClick={() => setEditor(current => ({ ...current, items: current.items.filter((_, i) => i !== index) }))} />
          </div>)}
          {!editor.items.length && <p className="text-sm text-mute">Sin ítems, la lista no cambia ningún precio.</p>}
          <Button type="button" variant="outline" onClick={() => setEditor(current => ({ ...current, items: [...current.items, itemVacio()] }))}>+ Ítem</Button>
        </div>
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEditor(null)} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy || !editor.name.trim()}>{busy ? 'Guardando…' : 'Guardar lista'}</Button></div>
      </form>}
    </Modal>

    <Modal open={aBorrar !== null} onClose={() => !busy && setABorrar(null)} title={`¿Eliminar ${aBorrar?.name || 'la lista'}?`} className="max-w-md">
      <p className="text-sm text-mute">Los clientes con esta lista asignada vuelven a su precio minorista o mayorista. La acción queda en la auditoría.</p>
      <div className="mt-4 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setABorrar(null)} disabled={busy}>Cancelar</Button><Button type="button" className="border-bad/50 bg-bad/10 text-bad" onClick={borrarLista} disabled={busy}>{busy ? 'Eliminando…' : 'Eliminar lista'}</Button></div>
    </Modal>
  </div>
}
