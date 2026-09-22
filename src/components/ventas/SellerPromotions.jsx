import { useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { readDemoPromotions, saveDemoPromotion, toggleDemoPromotion } from '@/lib/demoPromotions'
import { gs } from '@/utils/calculos'
import { getProductos } from '@/lib/storage'
import { Badge, Button, Input, MoneyInput, Select } from '@/components/ui'
import ProductCombobox from '@/components/shared/ProductCombobox'
import PercentField, { formatPercent, parsePercent } from '@/components/shared/PercentField'
import { cn } from '@/lib/utils'
import { SellerSection, SellerFeedback, useSellerData } from './SellerData'
import { CELDA_DATO, CELDA_ENCABEZADO } from '@/components/shared/tabla'
// Tabla compacta: una fila por cupón, con vigencia y estado en su columna.
const GRID_PROMOS = 'grid min-w-[56rem] grid-cols-[6.5rem_minmax(8rem,1.2fr)_7rem_minmax(8rem,1.2fr)_6.5rem_6.5rem_6.5rem_8rem] items-center gap-x-2'
const fechaCorta = (value) => {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }).replace('.', '')
}

const project = ({ id, code, name, kind, value, productId, startsAt, endsAt, maxUnits, usedUnits, isActive }) => ({ id, code, name, kind, value, productId, startsAt, endsAt, maxUnits, usedUnits, isActive })
const empty = { code: '', name: '', kind: 'PERCENT', value: '10', productId: '', startsAt: '', endsAt: '', maxUnits: '' }
export default function SellerPromotions() {
  const { esDemo, usuario } = useSesion()
  const admin = usuario?.role === 'ADMIN'
  const products = getProductos().filter(p => p.activo)
  const data = useSellerData('/api/promotions', project, readDemoPromotions, esDemo)
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function mutate(action) {
    if (busy) return
    setBusy(true); setMessage('')
    try { await action(); data.refresh(); setMessage('Guardado.') } catch (e) { setMessage(e.message || 'No se pudo guardar.') } finally { setBusy(false) }
  }
  function create(event) {
    event.preventDefault()
    mutate(async () => {
      const percentValue = form.kind === 'PERCENT' ? parsePercent(form.value) : null
      if (form.kind === 'PERCENT' && (percentValue === null || !Number.isSafeInteger(percentValue) || percentValue < 1 || percentValue > 100)) throw new Error('El porcentaje debe ser un entero entre 1 y 100.')
      const payload = { ...form, code: form.code.trim().toUpperCase(), name: form.name.trim(), value: form.kind === 'PERCENT' ? percentValue : Number(form.value), productId: form.productId.trim() || null, maxUnits: form.maxUnits ? Number(form.maxUnits) : null, startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString() }
      if (+new Date(payload.endsAt) <= +new Date(payload.startsAt)) throw new Error('Fin debe ser posterior al inicio.')
      if (esDemo) saveDemoPromotion(payload); else await api.post('/api/promotions', payload)
      setForm(empty)
    })
  }
  return <SellerSection description={esDemo ? 'Demo ficticia local. Usá DEMO10 al elegir un producto.' : 'Aplicá el código en el precio del producto. Se verifica nuevamente al registrar la venta.'}>
    <SellerFeedback {...data} empty={!data.rows.length} />
    {data.rows.length > 0 && <div className="overflow-x-auto" data-testid="promociones-tabla">
      <div className={cn(GRID_PROMOS, 'px-3.5 pb-2 pt-1')}>
        <span className={CELDA_ENCABEZADO}>Código</span>
        <span className={CELDA_ENCABEZADO}>Nombre</span>
        <span className={CELDA_ENCABEZADO}>Descuento</span>
        <span className={CELDA_ENCABEZADO}>Alcance</span>
        <span className={CELDA_ENCABEZADO}>Desde</span>
        <span className={CELDA_ENCABEZADO}>Hasta</span>
        <span className={CELDA_ENCABEZADO}>Estado</span>
        <span className={cn(CELDA_ENCABEZADO, 'text-right')}>Acciones</span>
      </div>
      <div className="space-y-1">{data.rows.map(p => {
        const estado = !p.isActive ? 'Inactiva' : Date.now() >= +new Date(p.endsAt) ? 'Vencida' : Date.now() < +new Date(p.startsAt) ? 'Programada' : 'Activa'
        const tono = estado === 'Activa' ? 'green' : estado === 'Programada' ? 'orange' : 'slate'
        const alcance = p.productId ? (products.find(product => product.id === p.productId)?.nombre || 'Producto específico') : 'Todos los productos'
        return <div key={p.id} data-testid="promocion-fila" className={cn(GRID_PROMOS, 'rounded-xl border border-ink-600 bg-ink-800/40 px-3.5 py-2 transition hover:border-fono/40')}>
          <span className="truncate font-mono text-[11px] font-bold text-fono-light" title={p.code}>{p.code}</span>
          <span className="truncate text-[13px] font-semibold" title={p.name}>{p.name}</span>
          <span className="truncate text-xs tabular-nums text-mute">{p.kind === 'PERCENT' ? `${formatPercent(p.value)}%` : gs(p.value)}</span>
          <span className={CELDA_DATO} title={alcance}>{alcance}</span>
          <span className={CELDA_DATO}>{fechaCorta(p.startsAt)}</span>
          <span className={CELDA_DATO}>{fechaCorta(p.endsAt)}</span>
          <span className="min-w-0"><Badge color={tono} className="w-fit whitespace-nowrap px-1.5 py-0.5 text-[10px]" title={p.maxUnits === null ? 'Sin límite de unidades' : `${Math.max(0, p.maxUnits - p.usedUnits)} disponibles de ${p.maxUnits}`}>{estado}</Badge></span>
          <span className="flex items-center justify-end">{admin && <Button type="button" variant="outline" className="h-8 whitespace-nowrap px-2 text-xs" disabled={busy} onClick={() => mutate(() => esDemo ? toggleDemoPromotion(p.id, !p.isActive) : api.patch('/api/promotions', { id: p.id, isActive: !p.isActive }))}>{p.isActive ? 'Desactivar' : 'Activar'}</Button>}</span>
        </div>
      })}</div>
    </div>}
    {admin && <form onSubmit={create} className="rounded-xl border border-fore/10 p-4">
      <h2 className="font-semibold">Crear cupón</h2>
      {/* Grilla responsive (#238): 1 campo por fila en móvil, 2 en tablet y hasta
          4 en desktop; los campos cortos no se estiran (ancho máximo propio). */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {['code', 'name'].map(key => (
          <label className="block" key={key}>
            {{ code: 'Código', name: 'Nombre' }[key]}
            <Input required pattern={key === 'code' ? '[A-Za-z0-9_-]{2,40}' : undefined} maxLength={key === 'code' ? 40 : 120} className={key === 'code' ? 'max-w-[11rem]' : ''} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} />
          </label>
        ))}
        <label className="block">
          Tipo
          <Select className="max-w-[11rem]" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}><option value="PERCENT">Porcentaje</option><option value="FIXED">Monto Gs. por unidad</option></Select>
        </label>
        <label className="block">
          Descuento
          {form.kind === 'FIXED'
            ? <MoneyInput required className="max-w-[9rem]" value={form.value} onValueChange={v => setForm({ ...form, value: v })} />
            : <PercentField required className="max-w-[9rem]" value={form.value} onChange={value => setForm({ ...form, value })} />}
        </label>
        <label className="block">
          Límite de unidades (opcional)
          <Input inputMode="numeric" type="number" step="1" min="1" max={2147483647} className="max-w-[9rem]" value={form.maxUnits} onChange={e => setForm({ ...form, maxUnits: e.target.value.replace(/\D/g, '') })} />
        </label>
        {['startsAt','endsAt'].map(key => (
          <label className="block" key={key}>
            {key === 'startsAt' ? 'Inicio (hora local)' : 'Fin (hora local)'}
            <Input required type="datetime-local" className="max-w-[13rem]" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} />
          </label>
        ))}
        <label className="block sm:col-span-2">
          Productos incluidos
          <span className="flex items-center gap-2">
            <ProductCombobox key={form.productId || 'todos'} className="flex-1" products={products} selectedId={form.productId} onSelect={product => setForm(current => ({ ...current, productId: product.id }))} placeholder="Todos los productos" />
            {form.productId && <button type="button" className="h-9 shrink-0 rounded-lg border border-ink-500 px-2 text-xs font-semibold text-mute transition hover:border-bad hover:text-bad" onClick={() => setForm(current => ({ ...current, productId: '' }))}>Quitar producto</button>}
          </span>
        </label>
      </div>
      <p className="mt-3 text-sm text-mute">No acumulable con descuento global. Para cambiar condiciones, desactivá el cupón y creá otro código.</p>
      <Button className="mt-3" disabled={busy}>Crear cupón</Button>
    </form>}
    {message && <p role="status">{message}</p>}
  </SellerSection>
}
