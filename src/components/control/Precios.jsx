import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { getProductos } from '@/lib/storage'
import { gs } from '@/utils/calculos'
import { Badge, Button, ConfirmDialog, Input, MoneyInput, Modal, Select, Skeleton } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import ProductCombobox from '@/components/shared/ProductCombobox'
import PercentField, { parsePercent } from '@/components/shared/PercentField'

// Gestión de listas de precios por cliente (issue #28): nombre y moneda, ítems
// por producto o categoría con monto en Gs, monto en USD o descuento %, y
// escalones por cantidad. La baja es lógica para no romper las fichas que la
// tengan asignada.

const listaVacia = () => ({ name: '', currency: 'PYG' })
const itemVacio = () => ({ key: crypto.randomUUID(), scope: 'PRODUCT', productId: '', category: '', tipo: 'PYG', unitPricePyg: '', unitPriceUsd: '', discountPct: '', tiers: [] })
const tierVacio = () => ({ key: crypto.randomUUID(), minQty: '', unitPricePyg: '' })

const soloDigitos = valor => String(valor ?? '').replace(/\D/g, '')
const decimal = valor => String(valor ?? '').replace(/[^\d.]/g, '')

const textoItem = (item, productos) => {
  if (item.scope === 'PRODUCT') return productos.find(p => p.id === item.productId)?.nombre || 'Producto'
  return `${item.category || 'Categoría'} (categoría)`
}

const textoPrecio = (item) => {
  if (item.unitPricePyg !== null && item.unitPricePyg !== undefined) return gs(Number(item.unitPricePyg))
  if (item.unitPriceUsd !== null && item.unitPriceUsd !== undefined) return `US$ ${Number(item.unitPriceUsd).toFixed(2)}`
  if (item.discountPct !== null && item.discountPct !== undefined) return `${Number(item.discountPct).toLocaleString('es-PY')}% de descuento`
  return 'Sin precio'
}

export default function Precios() {
  const { esDemo, usuario } = useSesion()
  const admin = usuario?.role === 'ADMIN'
  const productos = useMemo(() => getProductos().filter(p => p.activo), [])
  const categorias = useMemo(() => [...new Set(productos.map(p => p.category).filter(Boolean))].sort(), [productos])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [editor, setEditor] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [baja, setBaja] = useState(null)

  useEffect(() => {
    if (esDemo) { setRows([]); setLoading(false); return undefined }
    let activo = true
    setLoading(true); setError('')
    api.get('/api/price-lists')
      .then(data => { if (activo) { setRows(Array.isArray(data) ? data : []); setLoading(false) } })
      .catch(cause => { if (activo) { setError(cause?.message || 'No se pudieron cargar las listas.'); setLoading(false) } })
    return () => { activo = false }
  }, [esDemo, revision])

  const refrescar = () => setRevision(valor => valor + 1)

  function abrirCrear() {
    setMensaje('')
    setEditor({ id: null, ...listaVacia(), isActive: true, items: [] })
  }

  function abrirEditar(lista) {
    setMensaje('')
    setEditor({
      id: lista.id,
      name: lista.name,
      currency: lista.currency,
      isActive: lista.isActive,
      items: (lista.items || []).map(item => ({
        key: crypto.randomUUID(),
        scope: item.scope,
        productId: item.productId || '',
        category: item.category || '',
        tipo: item.unitPriceUsd !== null && item.unitPriceUsd !== undefined ? 'USD' : item.discountPct !== null && item.discountPct !== undefined ? 'PCT' : 'PYG',
        unitPricePyg: item.unitPricePyg ?? '',
        unitPriceUsd: item.unitPriceUsd !== null && item.unitPriceUsd !== undefined ? String(Number(item.unitPriceUsd)) : '',
        discountPct: item.discountPct !== null && item.discountPct !== undefined ? String(Number(item.discountPct)) : '',
        tiers: (item.tiers || []).map(tier => ({ key: crypto.randomUUID(), minQty: String(tier.minQty), unitPricePyg: String(tier.unitPricePyg) })),
      })),
    })
  }

  function payloadItem(item) {
    const base = item.scope === 'PRODUCT' ? { scope: 'PRODUCT', productId: item.productId } : { scope: 'CATEGORY', category: item.category.trim() }
    if (item.scope === 'PRODUCT' && !item.productId) throw new Error('Elegí el producto de cada ítem o cambiá el alcance a categoría.')
    if (item.scope === 'CATEGORY' && !item.category.trim()) throw new Error('Escribí la categoría de cada ítem.')
    const tiers = item.tipo === 'USD' ? [] : item.tiers
      .filter(tier => String(tier.minQty).trim() || String(tier.unitPricePyg).trim())
      .map(tier => ({ minQty: Number(soloDigitos(tier.minQty)), unitPricePyg: Number(soloDigitos(tier.unitPricePyg)) }))
    if (item.tipo === 'USD') return { ...base, unitPriceUsd: Number(decimal(item.unitPriceUsd)), tiers }
    if (item.tipo === 'PCT') return { ...base, discountPct: parsePercent(item.discountPct), tiers }
    return { ...base, unitPricePyg: Number(soloDigitos(item.unitPricePyg)), tiers }
  }

  async function guardar(event) {
    event.preventDefault()
    if (!editor || guardando) return
    setGuardando(true); setMensaje('')
    try {
      const body = {
        name: editor.name.trim(),
        currency: editor.currency,
        ...(editor.id ? { isActive: editor.isActive } : {}),
        items: editor.items.map(payloadItem),
      }
      if (!body.name) throw new Error('Poné un nombre a la lista.')
      if (editor.id) await api.patch(`/api/price-lists/${encodeURIComponent(editor.id)}`, body)
      else await api.post('/api/price-lists', body)
      setEditor(null)
      setMensaje(editor.id ? 'Lista actualizada.' : 'Lista creada.')
      refrescar()
    } catch (cause) {
      setMensaje(cause?.message || 'No se pudo guardar la lista.')
    } finally {
      setGuardando(false)
    }
  }

  async function cambiarEstado(lista, isActive) {
    try {
      await api.patch(`/api/price-lists/${encodeURIComponent(lista.id)}`, { isActive })
      setMensaje(isActive ? 'Lista activada.' : 'Lista desactivada.')
      refrescar()
    } catch (cause) {
      setMensaje(cause?.message || 'No se pudo cambiar el estado.')
    }
  }

  async function darDeBaja() {
    if (!baja) return
    try {
      await api.delete(`/api/price-lists/${encodeURIComponent(baja.id)}`)
      setBaja(null)
      setMensaje('Lista dada de baja: los clientes que la usaban vuelven a su precio de ficha.')
      refrescar()
    } catch (cause) {
      setMensaje(cause?.message || 'No se pudo dar de baja la lista.')
    }
  }

  function agregarItem() {
    setEditor(actual => ({ ...actual, items: [...actual.items, itemVacio()] }))
  }
  function editarItemEditor(key, patch) {
    setEditor(actual => ({ ...actual, items: actual.items.map(item => item.key === key ? { ...item, ...patch } : item) }))
  }
  function quitarItemEditor(key) {
    setEditor(actual => ({ ...actual, items: actual.items.filter(item => item.key !== key) }))
  }

  return <div className="space-y-4" data-testid="precios-panel">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Listas de precios</h1>
        <p className="mt-1.5 text-sm text-mute">Precios negociados por producto o categoría, con escalones por cantidad. La lista del cliente manda sobre el precio mayorista.</p>
      </div>
      {admin && !esDemo && <Button type="button" onClick={abrirCrear}><Icon name="plus" className="h-4 w-4" />Nueva lista</Button>}
    </div>
    {esDemo && <p className="rounded-xl border border-warn/30 bg-warn/5 p-3 text-sm text-warn">La demo no administra listas reales: probá esta pantalla con una sesión de administración.</p>}
    {mensaje && <p role="status" className="rounded-xl border border-ok/30 bg-ok/10 px-3.5 py-3 text-sm text-ok">{mensaje}</p>}
    {error && <p role="alert" className="rounded-xl border border-bad/30 bg-bad/10 px-3.5 py-3 text-sm text-bad">{error}</p>}
    {loading && <div className="space-y-2" aria-busy="true"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>}
    {!loading && !error && !rows.length && <div className="rounded-2xl border border-fore/10 bg-ink-800/30 p-8 text-center text-mute">Todavía no hay listas. Creá la primera para asignarla desde la ficha del cliente.</div>}
    <div className="space-y-3">
      {rows.map(lista => <article key={lista.id} data-testid="lista-precio-fila" className="rounded-2xl border border-ink-600 bg-ink-800/40 p-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold">{lista.name}</h2>
            <Badge color={lista.isActive ? 'green' : 'slate'}>{lista.isActive ? 'Activa' : 'Inactiva'}</Badge>
            <Badge color="blue">{lista.currency}</Badge>
            <Badge color="slate">{lista._count?.customers ?? 0} cliente{(lista._count?.customers ?? 0) === 1 ? '' : 's'} la usan</Badge>
            <span className="text-xs text-mute">{(lista.items || []).length} ítem{(lista.items || []).length === 1 ? '' : 's'}</span>
          </div>
          {admin && !esDemo && <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => abrirEditar(lista)}><Icon name="edit" className="h-3.5 w-3.5" />Editar</Button>
            <Button type="button" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => cambiarEstado(lista, !lista.isActive)}>{lista.isActive ? 'Desactivar' : 'Activar'}</Button>
            {lista.isActive && <Button type="button" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => setBaja(lista)}><Icon name="trash" className="h-3.5 w-3.5" />Dar de baja</Button>}
          </div>}
        </header>
        {lista.items?.length > 0 && <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {lista.items.map(item => <li key={item.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-ink-600/70 px-3 py-2 text-xs">
            <b className="truncate text-fore">{textoItem(item, productos)}</b>
            <span className="text-mute">{textoPrecio(item)}</span>
            {(item.tiers || []).map(tier => <span key={tier.id} className="rounded-full bg-fono/10 px-2 py-0.5 font-semibold text-fono-light">{tier.minQty}+ u · {gs(tier.unitPricePyg)}</span>)}
          </li>)}
        </ul>}
      </article>)}
    </div>

    <Modal
      open={Boolean(editor)}
      onClose={() => !guardando && setEditor(null)}
      title={editor?.id ? 'Editar lista de precios' : 'Nueva lista de precios'}
      className="max-w-3xl"
    >
      {editor && <form onSubmit={guardar} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <label className="block space-y-1.5 text-xs text-mute">Nombre<Input required maxLength={120} disabled={guardando} value={editor.name} onChange={event => setEditor(actual => ({ ...actual, name: event.target.value }))} placeholder="Ej: Mayorista VIP" /></label>
          <label className="block space-y-1.5 text-xs text-mute">Moneda<Select disabled={guardando} value={editor.currency} onChange={event => setEditor(actual => ({ ...actual, currency: event.target.value }))}><option value="PYG">Guaraníes (Gs)</option><option value="USD">Dólares (US$)</option></Select></label>
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold">Ítems de la lista</h3>
            <Button type="button" variant="outline" className="h-8 px-2.5 text-xs" disabled={guardando} onClick={agregarItem}><Icon name="plus" className="h-3.5 w-3.5" />Agregar ítem</Button>
          </div>
          {!editor.items.length && <p className="rounded-xl border border-fore/10 bg-fore/[.02] p-3 text-xs text-mute">Sin ítems: la lista no cambia ningún precio. Agregá un producto o una categoría.</p>}
          {editor.items.map((item, index) => <fieldset key={item.key} className="space-y-2 rounded-xl border border-ink-600 p-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="block space-y-1 text-[10px] font-bold uppercase tracking-wider text-mute">Alcance
                <Select className="h-9" disabled={guardando} value={item.scope} onChange={event => editarItemEditor(item.key, { scope: event.target.value })}><option value="PRODUCT">Producto</option><option value="CATEGORY">Categoría</option></Select>
              </label>
              <div className="min-w-[14rem] flex-1 space-y-1 text-[10px] font-bold uppercase tracking-wider text-mute">
                {item.scope === 'PRODUCT' ? 'Producto' : 'Categoría'}
                {item.scope === 'PRODUCT'
                  ? <ProductCombobox products={productos} selectedId={item.productId} onSelect={producto => editarItemEditor(item.key, { productId: producto.id })} placeholder="Elegí el producto" />
                  : <Input list="precios-categorias" className="h-9" disabled={guardando} value={item.category} onChange={event => editarItemEditor(item.key, { category: event.target.value })} placeholder="Ej: Audio" />}
              </div>
              <label className="block space-y-1 text-[10px] font-bold uppercase tracking-wider text-mute">Precio
                <Select className="h-9" disabled={guardando} value={item.tipo} onChange={event => editarItemEditor(item.key, { tipo: event.target.value })}><option value="PYG">Monto en Gs</option><option value="PCT">Descuento %</option><option value="USD">Monto en US$</option></Select>
              </label>
              <div className="w-36 space-y-1 text-[10px] font-bold uppercase tracking-wider text-mute">
                {item.tipo === 'PCT' ? 'Descuento' : item.tipo === 'USD' ? 'Monto US$' : 'Monto Gs'}
                {item.tipo === 'PCT'
                  ? <PercentField disabled={guardando} value={item.discountPct} onChange={value => editarItemEditor(item.key, { discountPct: value })} placeholder="%" className="h-9" />
                  : item.tipo === 'USD'
                    ? <Input inputMode="decimal" disabled={guardando} value={item.unitPriceUsd} onChange={event => editarItemEditor(item.key, { unitPriceUsd: decimal(event.target.value) })} placeholder="0.00" />
                    : <MoneyInput disabled={guardando} value={item.unitPricePyg} onValueChange={value => editarItemEditor(item.key, { unitPricePyg: value })} placeholder="0" />}
              </div>
              <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-mute transition hover:bg-bad/10 hover:text-bad" title="Quitar ítem" aria-label={`Quitar ítem ${index + 1}`} disabled={guardando} onClick={() => quitarItemEditor(item.key)}><Icon name="trash" className="h-4 w-4" /></button>
            </div>
            {item.tipo !== 'USD' && <div className="space-y-1.5 rounded-lg border border-ink-600/70 p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-mute">Escalones por cantidad (opcional)</p>
              {item.tiers.map(tier => <div key={tier.key} className="flex flex-wrap items-center gap-2">
                <Input aria-label="Desde cuántas unidades" inputMode="numeric" className="h-8 w-24 text-center" disabled={guardando} value={tier.minQty} onChange={event => editarItemEditor(item.key, { tiers: item.tiers.map(fila => fila.key === tier.key ? { ...fila, minQty: soloDigitos(event.target.value) } : fila) })} placeholder="Desde" />
                <MoneyInput aria-label="Precio del escalón" className="h-8 w-32" disabled={guardando} value={tier.unitPricePyg} onValueChange={value => editarItemEditor(item.key, { tiers: item.tiers.map(fila => fila.key === tier.key ? { ...fila, unitPricePyg: value } : fila) })} placeholder="Gs c/u" />
                <button type="button" className="text-xs text-mute hover:text-bad" disabled={guardando} onClick={() => editarItemEditor(item.key, { tiers: item.tiers.filter(fila => fila.key !== tier.key) })}>Quitar</button>
              </div>)}
              <button type="button" className="text-xs font-semibold text-fono-light" disabled={guardando} onClick={() => editarItemEditor(item.key, { tiers: [...item.tiers, tierVacio()] })}>+ Agregar escalón</button>
            </div>}
          </fieldset>)}
          <datalist id="precios-categorias">{categorias.map(categoria => <option key={categoria} value={categoria} />)}</datalist>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" disabled={guardando} onClick={() => setEditor(null)}>Cancelar</Button>
          <Button disabled={guardando || !editor.name.trim()}>{guardando ? 'Guardando…' : editor.id ? 'Guardar cambios' : 'Crear lista'}</Button>
        </div>
      </form>}
    </Modal>

    <ConfirmDialog
      open={Boolean(baja)}
      onCancel={() => setBaja(null)}
      onConfirm={darDeBaja}
      title="¿Dar de baja la lista?"
      description="Deja de aplicarse en el POS. Los clientes que la tengan asignada vuelven a su precio de ficha; la lista queda guardada como inactiva."
      confirmLabel="Dar de baja"
      variant="danger"
    />
  </div>
}
