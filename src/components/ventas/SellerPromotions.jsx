import { useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { readDemoPromotions, saveDemoPromotion, toggleDemoPromotion } from '@/lib/demoPromotions'
import { gs } from '@/utils/calculos'
import { getProductos } from '@/lib/storage'
import { Badge, Button, Input, MoneyInput, Select } from '@/components/ui'
import { SellerSection, SellerFeedback, useSellerData } from './SellerData'

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
      const payload = { ...form, code: form.code.trim().toUpperCase(), name: form.name.trim(), value: Number(form.value), productId: form.productId.trim() || null, maxUnits: form.maxUnits ? Number(form.maxUnits) : null, startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString() }
      if (+new Date(payload.endsAt) <= +new Date(payload.startsAt)) throw new Error('Fin debe ser posterior al inicio.')
      if (esDemo) saveDemoPromotion(payload); else await api.post('/api/promotions', payload)
      setForm(empty)
    })
  }
  return <SellerSection title="Promociones" description={esDemo ? 'Demo ficticia local. Usá DEMO10 al elegir un producto.' : 'Aplicá el código en el precio del producto. Se verifica nuevamente al registrar la venta.'}>
    <SellerFeedback {...data} empty={!data.rows.length} />
    <ul className="space-y-1.5">{data.rows.map(p => {
      const estado = !p.isActive ? 'Inactiva' : Date.now() >= +new Date(p.endsAt) ? 'Vencida' : Date.now() < +new Date(p.startsAt) ? 'Programada' : 'Activa'
      return <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-600 px-3 py-2 transition hover:border-fono/40">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2"><b className="truncate text-[13px]">{p.name}</b><span className="rounded border border-fono/25 bg-fono/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-fono-light">{p.code}</span><Badge color={estado === 'Activa' ? 'green' : estado === 'Vencida' ? 'slate' : estado === 'Programada' ? 'orange' : 'slate'}>{estado}</Badge></span>
          <span className="mt-0.5 block truncate text-[11px] text-mute">{p.kind === 'PERCENT' ? `${p.value}%` : gs(p.value)} por unidad · {p.productId ? (products.find(product => product.id === p.productId)?.nombre || 'Producto específico') : 'Todos los productos'} · {new Date(p.startsAt).toLocaleDateString('es-PY')} — {new Date(p.endsAt).toLocaleDateString('es-PY')} · {p.maxUnits === null ? 'sin límite' : `${Math.max(0, p.maxUnits - p.usedUnits)} disponibles`}</span>
        </span>
        {admin && <Button type="button" variant="outline" className="h-8 shrink-0 px-2 text-xs" disabled={busy} onClick={() => mutate(() => esDemo ? toggleDemoPromotion(p.id, !p.isActive) : api.patch('/api/promotions', { id: p.id, isActive: !p.isActive }))}>{p.isActive ? 'Desactivar' : 'Activar'}</Button>}
      </li>
    })}</ul>
    {admin && <form onSubmit={create} className="space-y-3 rounded-xl border border-fore/10 p-4">
      <h2 className="font-semibold">Crear cupón</h2>
      {['code', 'name'].map(key => <label className="block" key={key}>{{ code: 'Código', name: 'Nombre' }[key]}<Input required pattern={key === 'code' ? '[A-Za-z0-9_-]{2,40}' : undefined} maxLength={key === 'code' ? 40 : 120} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>)}
      <label className="block">Productos incluidos<Select value={form.productId} onChange={e => setForm({ ...form, productId: e.target.value })}><option value="">Todos los productos</option>{products.map(product => <option key={product.id} value={product.id}>{product.nombre}</option>)}</Select></label>
      <label className="block">Tipo<Select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}><option value="PERCENT">Porcentaje</option><option value="FIXED">Monto Gs. por unidad</option></Select></label>
      <label className="block">Descuento{form.kind === 'FIXED' ? <MoneyInput required value={form.value} onValueChange={v => setForm({ ...form, value: v })} /> : <Input inputMode="numeric" type="number" step="1" min="1" max={100} required value={form.value} onChange={e => setForm({ ...form, value: e.target.value.replace(/\D/g, '') })} />}</label>
      <label className="block">Límite de unidades (opcional)<Input inputMode="numeric" type="number" step="1" min="1" max={2147483647} value={form.maxUnits} onChange={e => setForm({ ...form, maxUnits: e.target.value.replace(/\D/g, '') })} /></label>
      {['startsAt','endsAt'].map(key => <label className="block" key={key}>{key === 'startsAt' ? 'Inicio (hora local)' : 'Fin (hora local)'}<Input required type="datetime-local" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>)}
      <p className="text-sm text-mute">No acumulable con descuento global. Para cambiar condiciones, desactivá el cupón y creá otro código.</p>
      <Button disabled={busy}>Crear cupón</Button>
    </form>}
    {message && <p role="status">{message}</p>}
  </SellerSection>
}
