import { useEffect, useState } from 'react'
import { getProductos, updateProducto, deleteProducto, addProducto, addProductoVariante, addProductoApi, updateProductoApi, modoDatosActual } from '@/lib/storage'
import { num, gs } from '@/utils/calculos'
import { Card, Button, Input, Badge, MoneyInput } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { deleteProductoApi } from '@/lib/api/products'

function FilaProducto({ p, vista = 'grid' }) {
  const margen = num(p.precioVenta) - num(p.precioCosto)
  const apiMode = modoDatosActual() === 'api'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState({ precioVenta: p.precioVenta ?? '', precioMayorista: p.precioMayorista ?? '', precioCosto: p.precioCosto ?? '', comision: p.comision ?? '', insuranceRate: p.insuranceRate ?? '', stock: p.stock ?? '' })
  const set = (campo, value) => async () => {
    if (apiMode) {
      const field = campo === 'precioVenta' ? 'pricePyg' : campo === 'precioCosto' ? 'costPyg' : campo === 'insuranceRate' ? 'insuranceRate' : campo === 'stock' ? 'stock' : null
      if (!field) return
      setBusy(true); setError('')
      try { await updateProductoApi(p.id, { [field]: num(value) }); window.dispatchEvent(new Event('mobos:catalog-updated')) } catch (err) { setError(err?.message || 'No se pudo guardar.') } finally { setBusy(false) }
      return
    }
    updateProducto(p.id, { [campo]: num(value) })
  }

  return (
    <div className={`rounded-xl border border-ink-600 bg-ink-800/50 p-3 transition hover:border-fono/35 ${vista === 'lista' ? 'md:grid md:grid-cols-[minmax(190px,1.1fr)_minmax(300px,1.8fr)_auto] md:items-start md:gap-4' : ''}`}>
      <div className="flex items-start justify-between gap-2 mb-2 md:mb-0">
        <div>
          <div className="font-bold text-sm">{p.nombre}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {p.condition && <Badge color={p.condition === 'USED' ? 'orange' : 'green'}>{p.condition === 'USED' ? 'Seminuevo' : p.condition === 'REFURBISHED' ? 'Reacondicionado' : 'Nuevo'}</Badge>}
            <Badge color={num(p.stock) <= 3 ? 'orange' : 'blue'}>{num(p.stock)} disponible{num(p.stock) === 1 ? '' : 's'}</Badge>
          </div>
        </div>
        <button
          onClick={() => {
            if (confirm(`¿Eliminar "${p.nombre}"?`)) {
              if (apiMode) { setBusy(true); setError(''); deleteProductoApi(p.id).then(() => window.dispatchEvent(new Event('mobos:catalog-updated'))).catch((err) => setError(err?.message || 'No se pudo eliminar.')).finally(() => setBusy(false)) }
              else deleteProducto(p.id)
            }
          }}
          className="text-bad text-sm px-2 py-1 rounded hover:bg-bad/10"
          title="Eliminar"
        >
          <Icon name="trash" className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] font-bold uppercase text-mute">Precio venta</span>
          <MoneyInput
            value={draft.precioVenta}
            onValueChange={(value) => setDraft((d) => ({ ...d, precioVenta: value }))}
            onBlur={set('precioVenta', draft.precioVenta)}
            placeholder="0"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase text-mute">Seguro de venta (%)</span>
          <Input inputMode="decimal" value={draft.insuranceRate} onChange={(e) => setDraft((d) => ({ ...d, insuranceRate: e.target.value.replace(',', '.') }))} onBlur={set('insuranceRate', draft.insuranceRate)} placeholder="Ej. 2" />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase text-mute">Precio mayorista</span>
          <MoneyInput disabled={apiMode} title={apiMode ? 'Este campo aún no existe en la API.' : undefined}
            value={draft.precioMayorista}
            onValueChange={(value) => setDraft((d) => ({ ...d, precioMayorista: value }))}
            onBlur={set('precioMayorista', draft.precioMayorista)}
            placeholder="0"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase text-mute">Costo</span>
          <MoneyInput
            value={draft.precioCosto}
            onValueChange={(value) => setDraft((d) => ({ ...d, precioCosto: value }))}
            onBlur={set('precioCosto', draft.precioCosto)}
            placeholder="0"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase text-mute">Comisión</span>
          <MoneyInput disabled={apiMode} title={apiMode ? 'Este campo aún no existe en la API.' : undefined}
            value={draft.comision}
            onValueChange={(value) => setDraft((d) => ({ ...d, comision: value }))}
            onBlur={set('comision', draft.comision)}
            placeholder="0"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase text-mute">Stock</span>
          <Input
            inputMode="numeric"
            value={draft.stock}
            onChange={(e) => setDraft((d) => ({ ...d, stock: e.target.value }))}
            onBlur={set('stock')}
            placeholder="0"
          />
        </label>
      </div>
      <div className={`flex flex-wrap items-center gap-2 mt-2 ${vista === 'lista' ? 'md:justify-end' : ''}`}>
        {Object.entries(p.atributos || {}).map(([k, v]) => <Badge key={k} color="blue">{k}: {v}</Badge>)}
        <Badge color={margen > 0 ? 'green' : 'slate'}>Margen {gs(margen)}</Badge>
        {num(p.stock) <= 3 && <Badge color="orange">Stock bajo</Badge>}
      </div>
      <p className="mt-2 text-[11px] text-mute">El seguro se descuenta del margen solo cuando la venta no se marca como “sin seguro”. Mayorista y comisión todavía no están disponibles en la API.</p>
      {busy && <p className="mt-1 text-xs text-mute">Guardando…</p>}
      {error && <p className="mt-1 text-xs text-bad">{error}</p>}
    </div>
  )
}

// Normaliza para buscar sin importar acentos ni mayúsculas.
function norm(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export default function Inventario() {
  const [, refresh] = useState(0)
  const productos = getProductos()
  const [nuevo, setNuevo] = useState('')
  const [modeloBase, setModeloBase] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [atributos, setAtributos] = useState('color=; capacidad=; estado=')
  const [vista, setVista] = useState('grid')
  const [condicion, setCondicion] = useState('todos')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const actualizar = () => refresh((n) => n + 1)
    window.addEventListener('mobos:catalog-updated', actualizar)
    return () => window.removeEventListener('mobos:catalog-updated', actualizar)
  }, [])

  const q = norm(busqueda.trim())
  const items = productos.filter((p) => {
    const coincide = !q || norm(p.nombre).includes(q) || norm(p.sku).includes(q) || norm(p.categoria).includes(q)
    const productCondition = p.condition || (norm(p.atributos?.estado).includes('semi') ? 'USED' : 'NEW')
    return coincide && (condicion === 'todos' || productCondition === condicion)
  })
  const bajos = productos.filter((p) => num(p.stock) <= 3).length

  async function crear(e) {
    e.preventDefault()
    const nombre = nuevo.trim()
    if (!nombre) return
    setBusy(true); setError('')
    try {
      if (modoDatosActual() === 'api') { await addProductoApi({ sku: `${norm(nombre).replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`, name: nombre, category: 'Otros', pricePyg: 0, stock: 0 }); window.dispatchEvent(new Event('mobos:catalog-updated')) }
      else addProducto(nombre)
      setNuevo('')
    } catch (err) { setError(err?.message || 'No se pudo crear el producto.') } finally { setBusy(false) }
  }

  async function crearVariante(e) {
    e.preventDefault()
    const base = productos.find((p) => p.nombre.toLowerCase() === modeloBase.trim().toLowerCase())
    if (!base) return
    const attrs = Object.fromEntries(atributos.split(';').map((x) => x.split('=').map((y) => y.trim())).filter(([k, v]) => k && v))
    setBusy(true); setError('')
    try {
      if (modoDatosActual() === 'api') { await addProductoApi({ sku: `${norm(`${base.nombre}-${Object.values(attrs).join('-')}`).replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`, name: `${base.nombre} · ${Object.values(attrs).join(' · ')}`, category: base.categoria || 'Otros', pricePyg: num(base.precioVenta), stock: 0 }); window.dispatchEvent(new Event('mobos:catalog-updated')) }
      else addProductoVariante(base, attrs)
      setModeloBase('')
    } catch (err) { setError(err?.message || 'No se pudo crear la variante.') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 md:p-5">
        <div className="flex flex-col gap-3 border-b border-ink-600 pb-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="font-bold">Inventario</h2>
              <span className="text-sm text-mute">{productos.length} productos · {bajos} con stock bajo</span>
            </div>
            <p className="mt-1 text-sm text-mute">Precios, costos y seguro se guardan al salir de cada campo. Las ubicaciones físicas y los IMEI se controlan por separado.</p>
          </div>
          <div className="flex rounded-lg border border-ink-600 bg-ink-900 p-1" aria-label="Vista de inventario">
            <button onClick={() => setVista('grid')} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${vista === 'grid' ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-white'}`}>Cuadrícula</button>
            <button onClick={() => setVista('lista')} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${vista === 'lista' ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-white'}`}>Lista</button>
          </div>
        </div>
        <form onSubmit={crear} className="mt-4 flex gap-2">
          <Input
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            placeholder="Nombre del nuevo producto"
            autoCapitalize="words"
          />
          <Button type="submit" disabled={busy}>Agregar</Button>
        </form>
        <form onSubmit={crearVariante} className="mb-4 rounded-xl border border-dashed border-ink-500 p-3">
          <div className="mb-2 text-xs font-semibold text-mute">Variante personalizada</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={modeloBase} onChange={(e) => setModeloBase(e.target.value)} placeholder="Modelo base exacto" />
            <Input value={atributos} onChange={(e) => setAtributos(e.target.value)} placeholder="color=; capacidad=; estado=" />
          </div>
          <Button type="submit" disabled={busy} variant="outline" className="mt-2 w-full sm:w-auto">Crear variante</Button>
        </form>
        <div className="mb-4 flex flex-col gap-2 md:flex-row">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mute">
            <Icon name="search" className="h-4 w-4" />
          </span>
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto…"
            autoCapitalize="none"
            autoCorrect="off"
            className="pl-9"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-mute hover:text-mute"
              title="Limpiar"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          )}
        </div>
          <div className="flex gap-1 overflow-x-auto rounded-lg border border-ink-600 bg-ink-900 p-1" aria-label="Filtrar condición">
            {[['todos', 'Todos'], ['NEW', 'Nuevos'], ['USED', 'Seminuevos'], ['REFURBISHED', 'Reacond.']].map(([key, label]) => <button key={key} onClick={() => setCondicion(key)} className={`shrink-0 rounded-md px-3 py-2 text-xs font-semibold ${condicion === key ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-white'}`}>{label}</button>)}
          </div>
        </div>
        {error && <p className="mb-4 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
        {items.length === 0 ? (
          <div className="p-8 text-center text-mute text-sm">
            {productos.length === 0
              ? 'Todavía no hay productos cargados.'
              : 'Ningún producto coincide con la búsqueda.'}
          </div>
        ) : (
          <div className={vista === 'grid' ? 'grid grid-cols-1 gap-3 xl:grid-cols-2' : 'space-y-2'}>
            {items.map((p) => (
              <FilaProducto key={p.id} p={p} vista={vista} />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
