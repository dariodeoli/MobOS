import { useState } from 'react'
import { getProductos, updateProducto, deleteProducto, addProducto, addProductoVariante } from '@/lib/storage'
import { num, gs } from '@/utils/calculos'
import { Card, Button, Input, Badge } from '@/components/ui'
import Icon from '@/components/shared/Icon'

function FilaProducto({ p }) {
  const margen = num(p.precioVenta) - num(p.precioCosto)
  const set = (campo) => (e) => updateProducto(p.id, { [campo]: num(e.target.value) })

  return (
    <div className="rounded-xl border border-ink-600 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="font-bold text-sm">{p.nombre}</div>
        <button
          onClick={() => {
            if (confirm(`¿Eliminar "${p.nombre}"?`)) deleteProducto(p.id)
          }}
          className="text-bad text-sm px-2 py-1 rounded hover:bg-bad/10"
          title="Eliminar"
        >
          <Icon name="trash" className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] font-bold uppercase text-mute">Precio venta ₲</span>
          <Input
            inputMode="numeric"
            defaultValue={p.precioVenta || ''}
            onBlur={set('precioVenta')}
            placeholder="0"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase text-mute">Precio mayorista ₲</span>
          <Input
            inputMode="numeric"
            defaultValue={p.precioMayorista || ''}
            onBlur={set('precioMayorista')}
            placeholder="0"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase text-mute">Costo ₲</span>
          <Input
            inputMode="numeric"
            defaultValue={p.precioCosto || ''}
            onBlur={set('precioCosto')}
            placeholder="0"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase text-mute">Comisión ₲</span>
          <Input
            inputMode="numeric"
            defaultValue={p.comision || ''}
            onBlur={set('comision')}
            placeholder="0"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase text-mute">Stock</span>
          <Input
            inputMode="numeric"
            defaultValue={p.stock || ''}
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
    </div>
  )
}

// Normaliza para buscar sin importar acentos ni mayúsculas.
function norm(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export default function Inventario() {
  const productos = getProductos()
  const [nuevo, setNuevo] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [atributos, setAtributos] = useState('color=; capacidad=; estado=')

  const q = norm(busqueda.trim())
  const items = !q ? productos : productos.filter((p) => norm(p.nombre).includes(q))

  function crear(e) {
    e.preventDefault()
    const nombre = nuevo.trim()
    if (!nombre) return
    addProducto(nombre)
    setNuevo('')
  }

  function crearVariante(e) {
    e.preventDefault()
    const [nombre, ...resto] = nuevo.split('|')
    const base = productos.find((p) => p.nombre.toLowerCase() === nombre.trim().toLowerCase())
    if (!base) return
    const attrs = Object.fromEntries(atributos.split(';').map((x) => x.split('=').map((y) => y.trim())).filter(([k, v]) => k && v))
    addProductoVariante(base, attrs)
    setNuevo('')
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
          <Button type="submit">Agregar</Button>
        </form>
        <form onSubmit={crearVariante} className="mb-4 rounded-xl border border-dashed border-ink-500 p-3">
          <div className="mb-2 text-xs font-semibold text-mute">Variante personalizada</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Modelo base exacto" />
            <Input value={atributos} onChange={(e) => setAtributos(e.target.value)} placeholder="color=; capacidad=; estado=" />
          </div>
          <Button type="submit" variant="outline" className="mt-2 w-full sm:w-auto">Crear variante</Button>
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
