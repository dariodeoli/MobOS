import { useEffect, useState } from 'react'
import { getProductos, updateProducto, deleteProducto, addProducto, addProductoVariante, addProductoApi, updateProductoApi, modoDatosActual } from '@/lib/storage'
import { num, gs } from '@/utils/calculos'
import { Card, Button, Input, Badge, MoneyInput } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { deleteProductoApi } from '@/lib/api/products'

function FilaProducto({ p }) {
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
    <div className="rounded-xl border border-ink-600 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="font-bold text-sm">{p.nombre}</div>
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
      <div className="flex items-center gap-2 mt-2">
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
  const [busqueda, setBusqueda] = useState('')
  const [atributos, setAtributos] = useState('color=; capacidad=; estado=')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const actualizar = () => refresh((n) => n + 1)
    window.addEventListener('mobos:catalog-updated', actualizar)
    return () => window.removeEventListener('mobos:catalog-updated', actualizar)
  }, [])

  const q = norm(busqueda.trim())
  const items = !q ? productos : productos.filter((p) => norm(p.nombre).includes(q))

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
    const [nombre, ...resto] = nuevo.split('|')
    const base = productos.find((p) => p.nombre.toLowerCase() === nombre.trim().toLowerCase())
    if (!base) return
    const attrs = Object.fromEntries(atributos.split(';').map((x) => x.split('=').map((y) => y.trim())).filter(([k, v]) => k && v))
    setBusy(true); setError('')
    try {
      if (modoDatosActual() === 'api') { await addProductoApi({ sku: `${norm(`${base.nombre}-${Object.values(attrs).join('-')}`).replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`, name: `${base.nombre} · ${Object.values(attrs).join(' · ')}`, category: base.categoria || 'Otros', pricePyg: num(base.precioVenta), stock: 0 }); window.dispatchEvent(new Event('mobos:catalog-updated')) }
      else addProductoVariante(base, attrs)
      setNuevo('')
    } catch (err) { setError(err?.message || 'No se pudo crear la variante.') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-bold mb-1">Inventario y precios</h2>
        <p className="text-sm text-mute mb-4">
          Cargá el <strong>precio de venta</strong>, el <strong>costo</strong> y la{' '}
          <strong>comisión</strong> de cada producto. Estos valores alimentan las comisiones de los
          vendedores y el tablero de ganancias. Se guarda al salir del campo.
        </p>
        <form onSubmit={crear} className="flex gap-2 mb-3">
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
            <Input value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Modelo base exacto" />
            <Input value={atributos} onChange={(e) => setAtributos(e.target.value)} placeholder="color=; capacidad=; estado=" />
          </div>
          <Button type="submit" disabled={busy} variant="outline" className="mt-2 w-full sm:w-auto">Crear variante</Button>
        </form>
        <div className="relative mb-4">
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
        {error && <p className="mb-4 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
        {items.length === 0 ? (
          <div className="p-8 text-center text-mute text-sm">
            {productos.length === 0
              ? 'Todavía no hay productos cargados.'
              : 'Ningún producto coincide con la búsqueda.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {items.map((p) => (
              <FilaProducto key={p.id} p={p} />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
