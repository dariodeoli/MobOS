import { useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { readDemoPromotions, saveDemoPromotion, toggleDemoPromotion } from '@/lib/demoPromotions'
import { gs } from '@/utils/calculos'
import { getProductos } from '@/lib/storage'
import { buttonClass, fieldClass, SellerSection, SellerFeedback, useSellerData } from './SellerData'

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
    <ul className="grid gap-3 sm:grid-cols-2">{data.rows.map(p => <li key={p.id} className="space-y-2 rounded-xl border border-white/10 p-4">
      <h2 className="font-semibold">{p.name} · {p.code}</h2>
      <p>{p.kind === 'PERCENT' ? `${p.value}%` : gs(p.value)} por unidad · {p.productId ? products.find(product => product.id === p.productId)?.nombre || 'Producto específico' : 'Todos los productos'}</p>
      <p className="text-sm text-mute">{new Date(p.startsAt).toLocaleString('es-PY')} — {new Date(p.endsAt).toLocaleString('es-PY')}</p>
      <p>{!p.isActive ? 'Inactiva' : Date.now() >= +new Date(p.endsAt) ? 'Vencida' : Date.now() < +new Date(p.startsAt) ? 'Programada' : 'Activa'} · {p.maxUnits === null ? 'Sin límite de unidades' : `${Math.max(0, p.maxUnits - p.usedUnits)} unidades disponibles`}</p>
      {admin && <button type="button" className={buttonClass} disabled={busy} onClick={() => mutate(() => esDemo ? toggleDemoPromotion(p.id, !p.isActive) : api.patch('/api/promotions', { id: p.id, isActive: !p.isActive }))}>{p.isActive ? 'Desactivar' : 'Activar'}</button>}
    </li>)}</ul>
    {admin && <form onSubmit={create} className="space-y-3 rounded-xl border border-white/10 p-4">
      <h2 className="font-semibold">Crear cupón</h2>
      {['code', 'name'].map(key => <label className="block" key={key}>{{ code: 'Código', name: 'Nombre' }[key]}<input className={fieldClass} required pattern={key === 'code' ? '[A-Za-z0-9_-]{2,40}' : undefined} maxLength={key === 'code' ? 40 : 120} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>)}
      <label className="block">Productos incluidos<select className={fieldClass} value={form.productId} onChange={e => setForm({ ...form, productId: e.target.value })}><option value="">Todos los productos</option>{products.map(product => <option key={product.id} value={product.id}>{product.nombre}</option>)}</select></label>
      <label className="block">Tipo<select className={fieldClass} value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}><option value="PERCENT">Porcentaje</option><option value="FIXED">Monto Gs. por unidad</option></select></label>
      {['value','maxUnits'].map(key => <label className="block" key={key}>{key === 'value' ? 'Descuento' : 'Límite de unidades (opcional)'}<input className={fieldClass} type="number" step="1" min="1" max={key === 'value' && form.kind === 'PERCENT' ? 100 : 2147483647} required={key === 'value'} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>)}
      {['startsAt','endsAt'].map(key => <label className="block" key={key}>{key === 'startsAt' ? 'Inicio (hora local)' : 'Fin (hora local)'}<input className={fieldClass} required type="datetime-local" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>)}
      <p className="text-sm text-mute">No acumulable con descuento global. Para cambiar condiciones, desactivá el cupón y creá otro código.</p>
      <button className={buttonClass} disabled={busy}>Crear cupón</button>
    </form>}
    {message && <p role="status">{message}</p>}
  </SellerSection>
}
