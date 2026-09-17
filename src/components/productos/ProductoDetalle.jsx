import { useCallback, useEffect, useMemo, useState } from 'react'
import { Drawer, Badge, Button, Input, Label, Money, MoneyInput, Select, Skeleton, Textarea, useToast } from '@/components/ui'
import { printPriceLabel } from '@/components/shared/OrderReceipt'
import Icon from '@/components/shared/Icon'
import PercentField, { formatPercent, parsePercent } from '@/components/shared/PercentField'
import { api } from '@/lib/api/client'
import { num } from '@/utils/calculos'
import SerialTexto from '@/components/shared/SerialTexto'

const CONDITION = { NEW: 'Nuevo', USED: 'Seminuevo', REFURBISHED: 'Reacondicionado' }
const DESTINATION = { NORMAL: 'Normal', OFFER: 'Oferta', WHOLESALE: 'Mayorista' }
const UNIT_STATUS = { AVAILABLE: 'Disponible', RESERVED: 'Reservado', SOLD: 'Vendido', DEFECTIVE: 'En revisión', IN_TRANSIT: 'En tránsito' }
const UNIT_TONE = { AVAILABLE: 'green', RESERVED: 'orange', SOLD: 'red', DEFECTIVE: 'slate', IN_TRANSIT: 'blue' }
const CATEGORIAS = ['Celulares', 'Accesorios', 'iPad', 'Apple Watch', 'Mac', 'Otros']

const nombre = (row) => row?.name || row?.nombre || ''
const precio = (row) => Number(row?.pricePyg ?? row?.precioVenta ?? 0)
const mayorista = (row) => Number(row?.wholesalePricePyg ?? 0)
const costo = (row) => Number(row?.costPyg ?? row?.precioCosto ?? 0)

// Detalle premium de un producto: ficha, stock por estado, equipos (IMEI) y
// edición para administración/gerencia.
export default function ProductoDetalle({ product, canManage, esDemo, onClose, onChanged, onSell }) {
  const toast = useToast()
  const [current, setCurrent] = useState(product)
  const [units, setUnits] = useState([])
  const [loadingUnits, setLoadingUnits] = useState(!esDemo)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState(() => ({
    categoria: product?.category || 'Otros',
    condicion: product?.condition || 'NEW',
    modelo: product?.model || '',
    color: product?.color || '',
    capacidad: product?.capacity || '',
    precio: String(precio(product) || ''),
    mayorista: String(mayorista(product) || ''),
    costo: String(costo(product) || ''),
    seguro: product?.insuranceRate != null ? String(product.insuranceRate) : '',
    umbral: product?.reorderPoint != null ? String(product.reorderPoint) : '',
    priceUsd: product?.priceUsd != null ? String(product.priceUsd) : '',
    garantiaDias: product?.warrantyDays != null ? String(product.warrantyDays) : '',
    garantiaCubre: product?.warrantyCoverage || '',
    garantiaNoCubre: product?.warrantyExclusions || '',
  }))

  const loadUnits = useCallback(async () => {
    if (esDemo || !current?.sku) { setLoadingUnits(false); return }
    setLoadingUnits(true)
    try {
      const rows = await api.get(`/api/inventory-units?q=${encodeURIComponent(current.sku)}`)
      setUnits((Array.isArray(rows) ? rows : []).filter(unit => unit.product?.sku === current.sku))
    } catch { setUnits([]) } finally { setLoadingUnits(false) }
  }, [current?.sku, esDemo])
  useEffect(() => { loadUnits() }, [loadUnits])

  const resumen = useMemo(() => {
    const base = { AVAILABLE: 0, RESERVED: 0, SOLD: 0, DEFECTIVE: 0, IN_TRANSIT: 0 }
    for (const unit of units) base[unit.status] = (base[unit.status] || 0) + 1
    return base
  }, [units])

  async function guardarEdicion(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      const seguro = parsePercent(form.seguro)
      const payload = {
        id: current.id,
        category: form.categoria,
        condition: form.condicion,
        model: form.modelo.trim(),
        color: form.color.trim(),
        capacity: form.capacidad.trim(),
        pricePyg: num(form.precio),
        ...(form.mayorista === '' ? { wholesalePricePyg: null } : { wholesalePricePyg: num(form.mayorista) }),
        ...(form.costo === '' ? { costPyg: null } : { costPyg: num(form.costo) }),
        ...(seguro === null ? { insuranceRate: null } : { insuranceRate: seguro }),
        ...(form.umbral === '' ? { reorderPoint: null } : { reorderPoint: num(form.umbral) }),
        ...(form.priceUsd === '' ? { priceUsd: null } : { priceUsd: Number(String(form.priceUsd).replace(',', '.')) }),
        ...(form.garantiaDias === '' ? { warrantyDays: null } : { warrantyDays: num(form.garantiaDias) }),
        warrantyCoverage: form.garantiaCubre.trim(),
        warrantyExclusions: form.garantiaNoCubre.trim(),
      }
      const updated = await api.patch('/api/products', payload)
      setCurrent(updated)
      setEditando(false)
      toast.success('Producto actualizado.')
      onChanged?.()
    } catch (cause) { setError(cause?.message || 'No se pudo actualizar el producto.') } finally { setBusy(false) }
  }
  async function desactivar() {
    if (busy || !current?.id) return
    setBusy(true); setError('')
    try {
      await api.delete(`/api/products?id=${encodeURIComponent(current.id)}`)
      toast.success('Producto desactivado.')
      onChanged?.()
      onClose?.()
    } catch (cause) { setError(cause?.message || 'No se pudo desactivar el producto.') } finally { setBusy(false) }
  }

  return (
    <Drawer open onClose={onClose} title={nombre(current)} className="w-full sm:max-w-xl">
      <div className="space-y-5">
        <section className="rounded-2xl border border-ink-600 bg-gradient-to-br from-ink-800 to-ink-800/40 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={current?.condition === 'NEW' ? 'green' : 'orange'}>{CONDITION[current?.condition] || current?.condition || 'Nuevo'}</Badge>
            <Badge color="slate">{current?.category || 'Sin categoría'}</Badge>
            {(current?.capacity || current?.color || current?.model) && <Badge color="slate">{[current?.model, current?.capacity, current?.color].filter(Boolean).join(' · ')}</Badge>}
            {current?.destination && current.destination !== 'NORMAL' && <Badge color="blue">{DESTINATION[current.destination]}</Badge>}
            {current?.isActive === false && <Badge color="red">Inactivo</Badge>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold tracking-wide">{current?.sku || 'Sin SKU'}</span>
            {current?.sku && <button type="button" className="rounded-md p-1 text-mute transition hover:bg-fore/5 hover:text-fore" title="Copiar SKU" aria-label="Copiar SKU" onClick={() => { navigator.clipboard?.writeText(current.sku).catch(() => {}); toast.success('SKU copiado.') }}><Icon name="copy" className="h-3.5 w-3.5" /></button>}
          </div>
          <p className="mt-1 text-xs text-mute">{current?.branch?.name || ''}{current?.branchId && !current?.branch?.name ? 'Sucursal asignada' : ''}</p>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <div><p className="text-xs text-mute">Precio de venta</p><p className="text-2xl font-bold tabular-nums text-fono-light">{precio(current) > 0 ? <Money value={precio(current)} /> : '—'}</p></div>
            {mayorista(current) > 0 && <div><p className="text-xs text-mute">Mayorista</p><p className="text-lg font-semibold tabular-nums"><Money value={mayorista(current)} /></p></div>}
            {current?.priceUsd != null && Number(current.priceUsd) > 0 && <div><p className="text-xs text-mute">En dólares</p><p className="text-lg font-semibold tabular-nums"><Money value={current.priceUsd} currency="USD" /></p></div>}
            <div className="ml-auto text-right"><p className="text-xs text-mute">Stock</p><p className="text-2xl font-bold tabular-nums">{current?.stock ?? 0}</p></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => onSell?.(current)}>Vender</Button>
            <Button variant="outline" disabled={busy} onClick={() => printPriceLabel(current, { format: 'thermal' })}>Etiqueta de precio</Button>
            {canManage && !esDemo && <Button variant="outline" disabled={busy} onClick={() => setEditando(value => !value)}>{editando ? 'Cancelar edición' : 'Editar'}</Button>}
            {canManage && !esDemo && <button type="button" disabled={busy} onClick={desactivar} className="rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-mute transition hover:border-bad hover:text-bad">Desactivar</button>}
          </div>
          {error && <p role="alert" className="mt-3 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
        </section>

        {editando && (
          <section className="rounded-2xl border border-fono/25 bg-fono/5 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-mute">Editar producto</h3>
            <form onSubmit={guardarEdicion} className="mt-3 grid gap-3 sm:grid-cols-2">
              <div><Label>Categoría</Label><Select value={form.categoria} onChange={event => setForm(current => ({ ...current, categoria: event.target.value }))}>{CATEGORIAS.map(categoria => <option key={categoria} value={categoria}>{categoria}</option>)}{!CATEGORIAS.includes(form.categoria) && form.categoria && <option value={form.categoria}>{form.categoria}</option>}</Select></div>
              <div><Label>Condición</Label><Select value={form.condicion} onChange={event => setForm(current => ({ ...current, condicion: event.target.value }))}>{Object.entries(CONDITION).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div>
              <div><Label>Modelo</Label><Input value={form.modelo} onChange={event => setForm(current => ({ ...current, modelo: event.target.value }))} placeholder="Ej. iPhone 15 Pro Max" /></div>
              <div><Label>Color</Label><Input value={form.color} onChange={event => setForm(current => ({ ...current, color: event.target.value }))} placeholder="Ej. Titanio Negro" /></div>
              <div><Label>Capacidad</Label><Input value={form.capacidad} onChange={event => setForm(current => ({ ...current, capacidad: event.target.value }))} placeholder="Ej. 256GB" /></div>
              <div><Label>Precio de venta (Gs)</Label><MoneyInput value={form.precio} onValueChange={value => setForm(current => ({ ...current, precio: value === '' ? '' : String(value) }))} /></div>
              <div><Label>Precio mayorista (Gs)</Label><MoneyInput value={form.mayorista} onValueChange={value => setForm(current => ({ ...current, mayorista: value === '' ? '' : String(value) }))} /></div>
              <div><Label>Costo (Gs)</Label><MoneyInput value={form.costo} onValueChange={value => setForm(current => ({ ...current, costo: value === '' ? '' : String(value) }))} /></div>
              <div><Label>Seguro (%)</Label><PercentField value={form.seguro} onChange={value => setForm(current => ({ ...current, seguro: value }))} placeholder="Ej. 2" /></div>
              <div><Label>Umbral de reposición</Label><Input inputMode="numeric" value={form.umbral} onChange={event => setForm(current => ({ ...current, umbral: event.target.value.replace(/\D/g, '') }))} placeholder="Ej. 3" /></div>
              <div><Label>Precio en USD (opcional)</Label><MoneyInput currency="USD" value={form.priceUsd} onValueChange={value => setForm(current => ({ ...current, priceUsd: value === '' ? '' : String(value) }))} placeholder="0,00" /></div>
              <div><Label>Garantía (días)</Label><Input inputMode="numeric" value={form.garantiaDias} onChange={event => setForm(current => ({ ...current, garantiaDias: event.target.value.replace(/\D/g, '') }))} placeholder="Ej. 365" /><p className="mt-1 text-[11px] text-mute">Al vender se crea la garantía del equipo automáticamente.</p></div>
              <div className="sm:col-span-2"><Label>Qué cubre</Label><Textarea rows={2} value={form.garantiaCubre} onChange={event => setForm(current => ({ ...current, garantiaCubre: event.target.value }))} placeholder="Defectos de fábrica…" /></div>
              <div className="sm:col-span-2"><Label>Qué no cubre</Label><Textarea rows={2} value={form.garantiaNoCubre} onChange={event => setForm(current => ({ ...current, garantiaNoCubre: event.target.value }))} placeholder="Daños físicos, humedad…" /></div>
              <div className="flex items-end"><Button type="submit" disabled={busy} className="w-full">{busy ? 'Guardando…' : 'Guardar cambios'}</Button></div>
            </form>
          </section>
        )}

        <section className="rounded-2xl border border-ink-600 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-mute">Equipos por estado</h3>
          {loadingUnits && <div className="mt-3 space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>}
          {!loadingUnits && units.length === 0 && <p className="mt-2 text-sm text-mute">{esDemo ? 'La lista de IMEI está disponible con una cuenta real.' : 'Este producto no tiene unidades serializadas cargadas.'}</p>}
          {!loadingUnits && units.length > 0 && <>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {Object.entries(UNIT_STATUS).map(([status, label]) => <div key={status} className="rounded-xl bg-ink-800/60 p-2.5 text-center"><p className="text-lg font-bold tabular-nums">{resumen[status] || 0}</p><p className="text-[10px] text-mute">{label}</p></div>)}
            </div>
            <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
              {units.map(unit => <div key={unit.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-600 px-3 py-2 text-xs">
                <SerialTexto serial={unit.serial} />
                <span className="flex items-center gap-2 text-mute">{unit.batteryHealth ? `${unit.batteryHealth}% · ` : ''}{unit.location?.name || 'Sin ubicación'}<Badge color={UNIT_TONE[unit.status] || 'slate'}>{UNIT_STATUS[unit.status] || unit.status}</Badge></span>
              </div>)}
            </div>
          </>}
        </section>

        <section className="rounded-2xl border border-ink-600 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-mute">Datos del catálogo</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Costo</p><p className="mt-1 font-semibold">{costo(current) > 0 ? <Money value={costo(current)} /> : 'pendiente'}</p></div>
            <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Seguro</p><p className="mt-1 font-semibold">{current?.insuranceRate != null && Number(current.insuranceRate) > 0 ? `${formatPercent(current.insuranceRate)}%` : 'sin seguro'}</p></div>
            <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Umbral de reposición</p><p className="mt-1 font-semibold">{current?.reorderPoint ?? '—'}</p></div>
            <div className="rounded-xl bg-ink-800/60 p-3"><p className="text-xs text-mute">Condición</p><p className="mt-1 font-semibold">{CONDITION[current?.condition] || '—'}</p></div>
          </div>
        </section>
      </div>
    </Drawer>
  )
}
