import { useMemo, useState } from 'react'
import { Aviso, Button, Input } from '@/components/ui'
import { capacidadesDeModelo, coloresDeVariante, modelosDeCatalogo, skuDeVariante, varianteExistente } from '@/lib/catalog'
import { addProductoApi } from '@/lib/storage'
import { PIE_ACCIONES } from '@/components/shared/formulario'

// #250 · Alta dependiente de una variante: **modelo → capacidad → color**.
//
// Un solo objeto para Stock y Compras: la búsqueda de productos la hace el
// buscador de la biblioteca (CMP, `ProductCombobox`) y esta cascada resuelve el
// alta. Las sugerencias salen del catálogo compartido (`lib/catalog.js`: lineup
// + productos ya cargados), el texto libre sigue permitido y el SKU único lo
// resuelve el servidor (`skuUnico`): acá no se duplica lógica de catálogo.
//
// `crear` permite inyectar otro alta (demo/tests); por defecto usa la API.
export default function VarianteProducto({ productos = [], modeloInicial = '', branchId = '', condicion = 'NEW', crear, onCreado, onCancelar, className }) {
  const [modelo, setModelo] = useState(String(modeloInicial || ''))
  const [capacidad, setCapacidad] = useState('')
  const [color, setColor] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const modelos = useMemo(() => modelosDeCatalogo(productos), [productos])
  const capacidades = useMemo(() => capacidadesDeModelo({ productos, modelo, condicion }), [productos, modelo, condicion])
  const colores = useMemo(() => coloresDeVariante({ productos, modelo, capacidad }), [productos, modelo, capacidad])
  // Si la variante ya está en el catálogo no se crea otra igual: se usa esa.
  const existente = useMemo(() => (modelo.trim() && capacidad.trim() ? varianteExistente({ productos, modelo, capacidad, color }) : null), [productos, modelo, capacidad, color])
  const listo = Boolean(modelo.trim() && capacidad.trim())
  const nombre = [modelo.trim(), capacidad.trim(), color.trim()].filter(Boolean).join(' · ')

  async function crearVariante() {
    if (!listo || busy) return
    setBusy(true); setError('')
    try {
      const payload = {
        name: modelo.trim(),
        model: modelo.trim(),
        capacity: capacidad.trim(),
        ...(color.trim() ? { color: color.trim() } : {}),
        sku: skuDeVariante({ modelo, capacidad, color }),
        pricePyg: 0,
        stock: 0,
        condition: condicion,
        ...(branchId ? { branchId } : {}),
      }
      const producto = await (crear ? crear(payload) : addProductoApi(payload))
      onCreado?.(producto)
    } catch (cause) {
      setError(cause?.message || 'No se pudo crear el producto.')
    } finally { setBusy(false) }
  }

  return (
    <div className={`space-y-3 rounded-xl border border-fono/25 bg-fono/5 p-3 ${className || ''}`} data-testid="variante-producto">
      <p className="text-[11px] font-bold uppercase tracking-wider text-mute">Producto nuevo · modelo → capacidad → color</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block text-xs text-mute">
          Modelo *
          <Input
            className="mt-1"
            autoFocus
            list="variante-producto-modelos"
            aria-label="Modelo del producto"
            autoCapitalize="words"
            value={modelo}
            onChange={event => { setModelo(event.target.value); setCapacidad(''); setColor('') }}
            placeholder="iPhone 15"
          />
        </label>
        <label className="block text-xs text-mute">
          Capacidad *
          <Input
            className="mt-1"
            list="variante-producto-capacidades"
            aria-label="Capacidad del producto"
            autoCapitalize="characters"
            disabled={!modelo.trim()}
            value={capacidad}
            onChange={event => { setCapacidad(event.target.value); setColor('') }}
            placeholder={modelo.trim() ? '128GB' : 'Elegí el modelo primero'}
          />
        </label>
        <label className="block text-xs text-mute">
          Color
          <Input
            className="mt-1"
            list="variante-producto-colores"
            aria-label="Color del producto"
            autoCapitalize="words"
            disabled={!capacidad.trim()}
            value={color}
            onChange={event => setColor(event.target.value)}
            placeholder={capacidad.trim() ? 'Negro' : 'Elegí la capacidad primero'}
          />
        </label>
      </div>
      <datalist id="variante-producto-modelos">{modelos.map(valor => <option key={valor} value={valor} />)}</datalist>
      <datalist id="variante-producto-capacidades">{capacidades.map(valor => <option key={valor} value={valor} />)}</datalist>
      <datalist id="variante-producto-colores">{colores.map(valor => <option key={valor} value={valor} />)}</datalist>
      <p className="text-xs text-mute" data-testid="variante-producto-preview">
        {nombre ? <>Se crea: <b className="text-fore">{nombre}</b>{existente ? ' · ya existe en el catálogo' : ''}</> : 'Completá el modelo y la capacidad.'}
        {capacidades.length > 0 && !capacidad ? ` · ${capacidades.length} capacidades conocidas` : ''}
        {colores.length > 0 && !color ? ` · ${colores.length} colores cargados` : ''}
      </p>
      {error && <Aviso tono="error" compact>{error}</Aviso>}
      <div className={PIE_ACCIONES}>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancelar}>Cancelar</Button>
        {existente
          ? <Button type="button" disabled={busy} onClick={() => onCreado?.(existente)}>Usar el existente</Button>
          : <Button type="button" disabled={!listo || busy} onClick={crearVariante} data-testid="variante-producto-crear">{busy ? 'Creando…' : 'Crear producto'}</Button>}
      </div>
    </div>
  )
}
