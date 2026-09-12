import { useRef, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { buttonClass, fieldClass, SellerFeedback, SellerSection, useSellerData } from './SellerData'

export const DEMO_CUSTOMERS_KEY = 'mobos:demo-customers:v1'
const emptyCustomer = { name: '', phone: '', address: '' }
export const customerFields = (row) => ({ id: row.id, name: row.name || '', phone: row.phone || '', address: row.address || (typeof row.notes === 'string' && row.notes.startsWith('Dirección: ') ? row.notes.slice('Dirección: '.length) : '') })
export function readDemoCustomers() {
  const rows = JSON.parse(localStorage.getItem(DEMO_CUSTOMERS_KEY) || '[]')
  if (!Array.isArray(rows)) throw new Error('Clientes demo inválidos')
  return rows.map(customerFields)
}

export default function SellerCustomers() {
  const { esDemo } = useSesion()
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(emptyCustomer)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [message, setMessage] = useState('')
  const [saveError, setSaveError] = useState('')
  const data = useSellerData(`/api/customers?q=${encodeURIComponent(search)}`, customerFields, readDemoCustomers, esDemo)
  const rows = esDemo ? data.rows.filter((row) => `${row.name} ${row.phone}`.toLowerCase().includes(search.toLowerCase())) : data.rows

  async function create(event) {
    event.preventDefault()
    if (savingRef.current || !form.name.trim()) return
    savingRef.current = true
    setSaving(true); setMessage(''); setSaveError('')
    try {
      if (esDemo) {
        const customer = { id: crypto.randomUUID(), name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim() }
        localStorage.setItem(DEMO_CUSTOMERS_KEY, JSON.stringify([...readDemoCustomers(), customer]))
      } else {
        const saved = await api.post('/api/customers', { name: form.name.trim(), phone: form.phone.trim(), notes: form.address.trim() ? `Dirección: ${form.address.trim()}` : undefined })
        if (!saved?.id) throw new Error('Sin confirmación')
      }
      setForm(emptyCustomer); setSearch(''); setQuery(''); data.refresh()
      setMessage(esDemo ? 'Cliente de prueba guardado en este navegador.' : 'Cliente guardado.')
    } catch {
      setSaveError('No se pudo confirmar el guardado. Buscá el cliente antes de reintentar.')
    } finally { savingRef.current = false; setSaving(false) }
  }

  return <SellerSection title="Clientes" description={esDemo ? 'Demo local: ingresá únicamente datos ficticios.' : 'Buscá por nombre o teléfono. La API devuelve hasta 50 coincidencias.'}>
    <form onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); data.refresh() }} className="flex gap-2">
      <input aria-label="Buscar clientes" className={fieldClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o teléfono" />
      <button className={buttonClass}>Buscar</button>
    </form>
    <SellerFeedback {...data} empty={!rows.length} />
    {!data.loading && !data.error && <ul className="grid gap-3 sm:grid-cols-2">{rows.map((row) => <li key={row.id} className="min-w-0 break-words rounded-xl border border-white/10 p-4">
      <h2 className="font-semibold">{row.name}</h2><p className="mt-1 text-slate-400">{row.phone || 'Sin teléfono'}</p>
      {row.address && <p className="mt-1 text-slate-400">{row.address}</p>}
    </li>)}</ul>}
    <form onSubmit={create} className="space-y-4 rounded-2xl border border-white/10 bg-white/[.02] p-5">
      <h2 className="text-lg font-semibold">Nuevo cliente</h2>
      {['name', 'phone', 'address'].map((key) => <label key={key} className="block space-y-2">
        <span>{{ name: 'Nombre', phone: 'Teléfono', address: esDemo ? 'Dirección de prueba' : 'Dirección' }[key]}</span>
        <input required={key === 'name'} maxLength={key === 'address' ? 300 : 120} type={key === 'phone' ? 'tel' : 'text'} className={fieldClass} disabled={saving} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
      </label>)}
      <button disabled={saving || !form.name.trim()} className={buttonClass}>{saving ? 'Guardando…' : 'Guardar cliente'}</button>
      {message && <p role="status" className="text-emerald-300">{message}</p>}
      {saveError && <p role="alert" className="text-red-300">{saveError}</p>}
    </form>
  </SellerSection>
}
