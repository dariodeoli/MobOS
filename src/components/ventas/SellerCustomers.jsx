import { useRef, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { buttonClass, fieldClass, SellerFeedback, SellerSection, useSellerData } from './SellerData'
import CustomerCommunicationCard from '@/components/customers/CustomerCommunicationCard'
import { customerMetadata, DEMO_MESSAGE_TEMPLATES, readCustomerMetadata } from '@/components/customers/customerMessaging'

export const DEMO_CUSTOMERS_KEY = 'mobos:demo-customers:v1'
const emptyCustomer = { name: '', phones: [''], addresses: [{ label: 'Principal', address: '', city: '' }] }
const templateFields = (row) => ({ id: row.id, name: row.name || 'Mensaje', body: row.body || '' })
const readDemoTemplates = () => DEMO_MESSAGE_TEMPLATES
export const customerFields = (row) => {
  const metadata = readCustomerMetadata(row.notes)
  const phone = row.phone || ''
  const phones = Array.from(new Set([phone, ...(row.phones || []), ...metadata.phones].filter(Boolean)))
  const legacyAddress = typeof row.notes === 'string' && row.notes.startsWith('Dirección: ') ? row.notes.slice('Dirección: '.length) : ''
  const addresses = Array.isArray(row.addresses) ? row.addresses : row.address || legacyAddress ? [{ id: 'legacy', label: 'Principal', address: row.address || legacyAddress }] : []
  return { id: row.id, name: row.name || '', phone, phones, countryCode: row.countryCode || '+595', address: addresses[0]?.address || '', addresses }
}
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
  const templateData = useSellerData('/api/message-templates', templateFields, readDemoTemplates, esDemo)
  const rows = esDemo ? data.rows.filter((row) => `${row.name} ${(row.phones || []).join(' ')}`.toLowerCase().includes(search.toLowerCase())) : data.rows

  async function create(event) {
    event.preventDefault()
    if (savingRef.current || !form.name.trim()) return
    savingRef.current = true
    setSaving(true); setMessage(''); setSaveError('')
    try {
      const phones = form.phones.map((phone) => phone.trim()).filter(Boolean).slice(0, 5)
      const addresses = form.addresses.filter((address) => address.address.trim()).map((address, index) => ({ label: address.label.trim() || `Dirección ${index + 1}`, address: address.address.trim(), ...(address.city.trim() ? { city: address.city.trim() } : {}), isDefault: index === 0 }))
      if (esDemo) {
        const customer = { id: crypto.randomUUID(), name: form.name.trim(), phone: phones[0] || '', phones, countryCode: '+595', addresses }
        localStorage.setItem(DEMO_CUSTOMERS_KEY, JSON.stringify([...readDemoCustomers(), customer]))
      } else {
        const saved = await api.post('/api/customers', { name: form.name.trim(), phone: phones[0] || undefined, countryCode: '+595', addresses, notes: customerMetadata(phones) })
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
    {!data.loading && !data.error && <ul className="grid gap-3 sm:grid-cols-2">{rows.map((row) => <CustomerCommunicationCard key={row.id} customer={row} templates={templateData.rows} />)}</ul>}
    {!templateData.loading && templateData.error && <p className="rounded-xl border border-amber-400/30 bg-amber-300/10 p-3 text-sm text-amber-100">No se pudieron cargar las plantillas. Podés seguir gestionando clientes.</p>}
    <form onSubmit={create} className="space-y-4 rounded-2xl border border-white/10 bg-white/[.02] p-5">
      <h2 className="text-lg font-semibold">Nuevo cliente</h2>
      <label className="block space-y-2"><span>Nombre</span><input required maxLength={120} className={fieldClass} disabled={saving} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <fieldset className="space-y-2"><legend>Teléfonos</legend>{form.phones.map((phone, index) => <div className="flex gap-2" key={`phone-${index}`}><input type="tel" maxLength={30} className={fieldClass} disabled={saving} value={phone} placeholder={index === 0 ? '0981 123 456' : 'Otro teléfono'} onChange={(event) => setForm({ ...form, phones: form.phones.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} />{form.phones.length > 1 && <button type="button" className="rounded-xl border border-white/15 px-3 text-sm" onClick={() => setForm({ ...form, phones: form.phones.filter((_, itemIndex) => itemIndex !== index) })}>Quitar</button>}</div>)}{form.phones.length < 5 && <button type="button" className="text-sm font-semibold text-fono-light" onClick={() => setForm({ ...form, phones: [...form.phones, ''] })}>+ Añadir teléfono</button>}</fieldset>
      <fieldset className="space-y-3"><legend>Direcciones</legend>{form.addresses.map((address, index) => <div className="grid gap-2 rounded-xl border border-white/10 p-3 sm:grid-cols-2" key={`address-${index}`}><input maxLength={80} className={fieldClass} disabled={saving} value={address.label} placeholder="Etiqueta: Casa, oficina…" onChange={(event) => setForm({ ...form, addresses: form.addresses.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} /><input maxLength={100} className={fieldClass} disabled={saving} value={address.city} placeholder="Ciudad (opcional)" onChange={(event) => setForm({ ...form, addresses: form.addresses.map((item, itemIndex) => itemIndex === index ? { ...item, city: event.target.value } : item) })} /><input maxLength={400} className={`${fieldClass} sm:col-span-2`} disabled={saving} value={address.address} placeholder={esDemo ? 'Dirección de prueba' : 'Dirección completa'} onChange={(event) => setForm({ ...form, addresses: form.addresses.map((item, itemIndex) => itemIndex === index ? { ...item, address: event.target.value } : item) })} />{form.addresses.length > 1 && <button type="button" className="text-left text-sm text-red-300" onClick={() => setForm({ ...form, addresses: form.addresses.filter((_, itemIndex) => itemIndex !== index) })}>Quitar dirección</button>}</div>)}{form.addresses.length < 10 && <button type="button" className="text-sm font-semibold text-fono-light" onClick={() => setForm({ ...form, addresses: [...form.addresses, { label: '', address: '', city: '' }] })}>+ Añadir dirección</button>}</fieldset>
      <button disabled={saving || !form.name.trim()} className={buttonClass}>{saving ? 'Guardando…' : 'Guardar cliente'}</button>
      {message && <p role="status" className="text-emerald-300">{message}</p>}
      {saveError && <p role="alert" className="text-red-300">{saveError}</p>}
    </form>
  </SellerSection>
}
