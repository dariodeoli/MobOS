import { useEffect, useState } from 'react'
import { Aviso, Badge, Button, Input, Modal, MoneyInput, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import ProductCombobox from '@/components/shared/ProductCombobox'
import { resources } from '@/lib/api'
import { getProductos } from '@/lib/storage'
import { gs, num } from '@/utils/calculos'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'

const emptyComponent = () => ({ productId: '', quantity: '1' })

// Gestión de combos (solo administración/gerencia): paquetes con precio fijo
// que el POS agrega como varias líneas repartiendo el precio entre componentes.
export default function ComboManager({ open, onClose }) {
  const toast = useToast()
  const productos = getProductos().filter(product => product.activo !== false)
  const [combos, setCombos] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', pricePyg: '', components: [emptyComponent(), emptyComponent()] })

  async function load() {
    setLoading(true); setError('')
    try { setCombos((await resources.combos.list(true)) || []) } catch (cause) { setError(cause?.message || 'No se pudieron cargar los combos.') } finally { setLoading(false) }
  }
  useEffect(() => { if (open) load() }, [open])  


  const componentesValidos = form.components.filter(item => item.productId && num(item.quantity) > 0)
  const precioLista = componentesValidos.reduce((sum, item) => sum + Number(productos.find(p => p.id === item.productId)?.precioVenta || 0) * num(item.quantity), 0)

  async function crear(event) {
    event.preventDefault()
    if (busy || !form.name.trim() || num(form.pricePyg) <= 0 || componentesValidos.length < 2) {
      setError('Indicá nombre, precio y al menos 2 componentes.')
      return
    }
    setBusy(true); setError('')
    try {
      await resources.combos.create({ name: form.name.trim(), pricePyg: num(form.pricePyg), items: componentesValidos.map(item => ({ productId: item.productId, quantity: num(item.quantity) })) })
      toast.success('Combo creado.')
      setForm({ name: '', pricePyg: '', components: [emptyComponent(), emptyComponent()] })
      await load()
    } catch (cause) { setError(cause?.message || 'No se pudo crear el combo.') } finally { setBusy(false) }
  }
  async function alternar(combo) {
    if (busy) return
    setBusy(true); setError('')
    try { await resources.combos.update({ id: combo.id, isActive: !combo.isActive }); await load() } catch (cause) { setError(cause?.message || 'No se pudo actualizar el combo.') } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title="Combos" size="amplio">
      <div className="space-y-4">
        <p className="text-sm text-mute">Un combo agrupa productos con precio fijo (ej. funda + lámina). El POS lo agrega como varias líneas repartiendo el precio, y descuenta el stock de cada componente.</p>
        {error && <Aviso tono="error">{error}</Aviso>}
        {loading && <p className="text-sm text-mute">Cargando combos…</p>}
        {!loading && combos.length > 0 && <div className="space-y-1.5">{combos.map(combo => <div key={combo.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-600 px-3 py-2"><span className="min-w-0 flex-1"><b className="block truncate text-[13px]">{combo.name}</b><span className="mt-0.5 block truncate text-[11px] text-mute">{(combo.items || []).map(item => `${item.quantity} × ${productos.find(p => p.id === item.productId)?.nombre || 'producto'}`).join(' + ')}</span></span><b className="shrink-0 text-sm tabular-nums">{gs(combo.pricePyg)}</b><Badge color={combo.isActive ? 'green' : 'slate'}>{combo.isActive ? 'Activo' : 'Inactivo'}</Badge><button type="button" disabled={busy} className="shrink-0 rounded-lg border border-ink-500 px-2 py-1 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore" onClick={() => alternar(combo)}>{combo.isActive ? 'Desactivar' : 'Activar'}</button></div>)}</div>}
        {!loading && !combos.length && <p className="text-sm text-mute">Todavía no hay combos creados.</p>}
        <form onSubmit={crear} className="space-y-3 rounded-2xl border border-fono/25 bg-fono/[.05] p-4">
          <h3 className="text-sm font-bold">Nuevo combo</h3>
          <div className={GRILLA_DOS_COLUMNAS}>
            <label className="block space-y-1.5 text-xs text-mute">Nombre<Input required maxLength={200} value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Ej. Funda + lámina" /></label>
            <label className="block space-y-1.5 text-xs text-mute">Precio del combo (Gs)<MoneyInput required value={form.pricePyg} onValueChange={value => setForm(current => ({ ...current, pricePyg: value === '' ? '' : String(value) }))} placeholder="0" /></label>
          </div>
          <div className="space-y-2">
            {form.components.map((component, index) => <div key={index} className="flex gap-2">
              <ProductCombobox className="flex-1" products={productos} selectedId={component.productId} onSelect={product => setForm(current => ({ ...current, components: current.components.map((row, i) => i === index ? { ...row, productId: product.id } : row) }))} placeholder="Producto…" />
              <Input className="w-20" inputMode="numeric" value={component.quantity} onChange={event => setForm(current => ({ ...current, components: current.components.map((row, i) => i === index ? { ...row, quantity: event.target.value.replace(/\D/g, '') } : row) }))} placeholder="Cant." />
              <button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-mute transition hover:bg-bad/10 hover:text-bad" aria-label="Quitar componente" onClick={() => setForm(current => ({ ...current, components: current.components.length > 2 ? current.components.filter((_, i) => i !== index) : current.components }))}><Icon name="trash" className="h-4 w-4" /></button>
            </div>)}
            <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" onClick={() => setForm(current => ({ ...current, components: [...current.components, emptyComponent()] }))}>+ Componente</Button><span className="text-xs text-mute">Precio de lista: {gs(precioLista)}{num(form.pricePyg) > 0 && precioLista > 0 ? ` · combo ${gs(num(form.pricePyg))} (${Math.max(0, Math.round((1 - num(form.pricePyg) / precioLista) * 100))}% menos)` : ''}</span></div>
          </div>
          <Button type="submit" disabled={busy || !form.name.trim() || num(form.pricePyg) <= 0 || componentesValidos.length < 2}>{busy ? 'Guardando…' : 'Crear combo'}</Button>
        </form>
      </div>
    </Modal>
  )
}
