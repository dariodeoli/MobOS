import { useEffect, useRef, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { Button, Input } from '@/components/ui'
import CityAutocomplete from '@/components/shared/CityAutocomplete'
import { SellerFeedback, SellerSection, useSellerData } from './SellerData'
import CustomerCommunicationCard from '@/components/customers/CustomerCommunicationCard'
import CustomerProfile from '@/components/customers/CustomerProfile'
import { customerMetadata, DEMO_MESSAGE_TEMPLATES, readCustomerMetadata } from '@/components/customers/customerMessaging'

export const DEMO_CUSTOMERS_KEY = 'mobos:demo-customers:v1'
const emptyCustomer = { name: '', document: '', email: '', phones: [''], addresses: [{ label: 'Principal', address: '', city: '', department: '' }] }
const templateFields = (row) => ({ id: row.id, name: row.name || 'Mensaje', body: row.body || '' })
const readDemoTemplates = () => DEMO_MESSAGE_TEMPLATES
export const customerFields = (row) => {
  const metadata = readCustomerMetadata(row.notes)
  const phone = row.phone || ''
  const phones = Array.from(new Set([phone, ...(row.phones || []), ...metadata.phones].filter(Boolean)))
  const legacyAddress = typeof row.notes === 'string' && row.notes.startsWith('Dirección: ') ? row.notes.slice('Dirección: '.length) : ''
  const addresses = Array.isArray(row.addresses) ? row.addresses : row.address || legacyAddress ? [{ id: 'legacy', label: 'Principal', address: row.address || legacyAddress }] : []
  return { id: row.id, name: row.name || '', document: row.document || '', email: row.email || '', phone, phones, countryCode: row.countryCode || '+595', address: addresses[0]?.address || '', addresses }
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
  const [rucResult, setRucResult] = useState(null)
  const [rucLoading, setRucLoading] = useState(false)
  const [rucError, setRucError] = useState('')
  const [profileCustomer, setProfileCustomer] = useState(null)
  const formRef = useRef(null)
  const nombreRef = useRef(null)
  const data = useSellerData(`/api/customers?q=${encodeURIComponent(search)}`, customerFields, readDemoCustomers, esDemo)
  const templateData = useSellerData('/api/message-templates', templateFields, readDemoTemplates, esDemo)
  const rows = esDemo ? data.rows.filter((row) => `${row.name} ${(row.phones || []).join(' ')}`.toLowerCase().includes(search.toLowerCase())) : data.rows

  useEffect(() => {
    if (window.__mobosNewCustomer) {
      delete window.__mobosNewCustomer
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      nombreRef.current?.focus()
    }
    function onNewCustomer() {
      delete window.__mobosNewCustomer
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      nombreRef.current?.focus()
    }
    window.addEventListener('mobos:new-customer', onNewCustomer)
    return () => window.removeEventListener('mobos:new-customer', onNewCustomer)
  }, [])

  async function create(event) {
    event.preventDefault()
    if (savingRef.current || !form.name.trim()) return
    savingRef.current = true
    setSaving(true); setMessage(''); setSaveError('')
    try {
      const phones = form.phones.map((phone) => phone.trim()).filter(Boolean).slice(0, 5)
      const addresses = form.addresses.filter((address) => address.address.trim()).map((address, index) => ({ label: address.label.trim() || `Dirección ${index + 1}`, address: address.address.trim(), ...(address.city.trim() ? { city: address.city.trim() } : {}), ...(address.department?.trim() ? { department: address.department.trim() } : {}), isDefault: index === 0 }))
      if (esDemo) {
        const customer = { id: crypto.randomUUID(), name: form.name.trim(), document: form.document.trim(), email: form.email.trim(), phone: phones[0] || '', phones, countryCode: '+595', addresses }
        localStorage.setItem(DEMO_CUSTOMERS_KEY, JSON.stringify([...readDemoCustomers(), customer]))
      } else {
        const saved = await api.post('/api/customers', { name: form.name.trim(), document: form.document.trim() || undefined, email: form.email.trim() || undefined, phone: phones[0] || undefined, countryCode: '+595', addresses, notes: customerMetadata(phones) })
        if (!saved?.id) throw new Error('Sin confirmación')
      }
      setForm(emptyCustomer); setRucResult(null); setRucError(''); setSearch(''); setQuery(''); data.refresh()
      setMessage(esDemo ? 'Cliente de prueba guardado en este navegador.' : 'Cliente guardado.')
    } catch {
      setSaveError('No se pudo confirmar el guardado. Buscá el cliente antes de reintentar.')
    } finally { savingRef.current = false; setSaving(false) }
  }

  async function lookupRuc() {
    if (!form.document.trim() || esDemo) return
    setRucLoading(true); setRucError(''); setRucResult(null)
    try {
      const response = await api.get(`/api/ruc?ruc=${encodeURIComponent(form.document.trim())}`)
      if (!response?.result?.name) throw new Error('No encontramos datos para ese RUC.')
      setRucResult(response.result)
    } catch (cause) { setRucError(cause?.message || 'No se pudo consultar el RUC. Podés completar los datos manualmente.') } finally { setRucLoading(false) }
  }

  return <SellerSection title="Clientes" description={esDemo ? 'Demo local: ingresá únicamente datos ficticios.' : 'Buscá por nombre o teléfono. La API devuelve hasta 50 coincidencias.'}>
    <form onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); data.refresh() }} className="flex gap-2">
      <Input aria-label="Buscar clientes" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o teléfono" />
      <Button>Buscar</Button>
    </form>
    <SellerFeedback {...data} empty={!rows.length} />
    {!data.loading && !data.error && <ul className="grid gap-3 sm:grid-cols-2">{rows.map((row) => <CustomerCommunicationCard key={row.id} customer={row} templates={templateData.rows} onViewProfile={esDemo ? undefined : setProfileCustomer} />)}</ul>}
    <CustomerProfile customer={profileCustomer} open={Boolean(profileCustomer)} onClose={() => setProfileCustomer(null)} />
    {!templateData.loading && templateData.error && <p className="rounded-xl border border-amber-400/30 bg-amber-300/10 p-3 text-sm text-amber-100">No se pudieron cargar las plantillas. Podés seguir gestionando clientes.</p>}
    <form ref={formRef} onSubmit={create} className="space-y-4 rounded-2xl border border-fore/10 bg-fore/[.02] p-5">
      <h2 className="text-lg font-semibold">Nuevo cliente</h2>
      <label className="block space-y-2"><span>Nombre</span><Input ref={nombreRef} required maxLength={120} disabled={saving} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-2"><span>RUC o CI <small className="text-mute">(opcional)</small></span><Input maxLength={100} disabled={saving} value={form.document} onChange={(event) => { setForm({ ...form, document: event.target.value }); setRucResult(null); setRucError('') }} placeholder="80012345-6" /></label><label className="block space-y-2"><span>Correo <small className="text-mute">(opcional)</small></span><Input type="email" maxLength={200} disabled={saving} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="cliente@correo.com" /></label></div>
      {!esDemo && <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={saving || rucLoading || !form.document.trim()} className="rounded-xl border border-fono/40 px-3 py-2 text-sm font-semibold text-fono-light disabled:opacity-40" onClick={lookupRuc}>{rucLoading ? 'Consultando RUC…' : 'Consultar RUC'}</button><span className="text-xs text-mute">La razón social se aplica solo si la confirmás.</span></div>}
      {rucResult && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-fono/25 bg-fono/5 p-3 text-sm"><span><b>{rucResult.name}</b><br /><span className="text-mute">RUC {rucResult.fullRuc}</span></span><button type="button" className="font-semibold text-fono-light" onClick={() => { setForm({ ...form, name: rucResult.name, document: rucResult.fullRuc || form.document }); setRucResult(null) }}>Usar estos datos</button></div>}
      {rucError && <p role="alert" className="text-sm text-red-300">{rucError}</p>}
      <fieldset className="space-y-2"><legend>Teléfonos</legend>{form.phones.map((phone, index) => <div className="flex gap-2" key={`phone-${index}`}><Input type="tel" maxLength={30} disabled={saving} value={phone} placeholder={index === 0 ? '0981 123 456' : 'Otro teléfono'} onChange={(event) => setForm({ ...form, phones: form.phones.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} />{form.phones.length > 1 && <button type="button" className="rounded-xl border border-fore/15 px-3 text-sm" onClick={() => setForm({ ...form, phones: form.phones.filter((_, itemIndex) => itemIndex !== index) })}>Quitar</button>}</div>)}{form.phones.length < 5 && <button type="button" className="text-sm font-semibold text-fono-light" onClick={() => setForm({ ...form, phones: [...form.phones, ''] })}>+ Añadir teléfono</button>}</fieldset>
      <fieldset className="space-y-3"><legend>Direcciones</legend>{form.addresses.map((address, index) => <div className="grid gap-2 rounded-xl border border-fore/10 p-3 sm:grid-cols-2" key={`address-${index}`}><Input maxLength={80} disabled={saving} value={address.label} placeholder="Etiqueta: Casa, oficina…" onChange={(event) => setForm({ ...form, addresses: form.addresses.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} /><div className="space-y-1"><CityAutocomplete esDemo={esDemo} disabled={saving} value={address.city || ''} onSelect={(city, department) => setForm({ ...form, addresses: form.addresses.map((item, itemIndex) => itemIndex === index ? { ...item, city, department } : item) })} />{address.department && <p className="px-1 text-xs text-fono-light">Departamento: {address.department}</p>}</div><Input maxLength={400} className="sm:col-span-2" disabled={saving} value={address.address} placeholder={esDemo ? 'Dirección de prueba' : 'Dirección completa'} onChange={(event) => setForm({ ...form, addresses: form.addresses.map((item, itemIndex) => itemIndex === index ? { ...item, address: event.target.value } : item) })} />{form.addresses.length > 1 && <button type="button" className="text-left text-sm text-red-300" onClick={() => setForm({ ...form, addresses: form.addresses.filter((_, itemIndex) => itemIndex !== index) })}>Quitar dirección</button>}</div>)}{form.addresses.length < 10 && <button type="button" className="text-sm font-semibold text-fono-light" onClick={() => setForm({ ...form, addresses: [...form.addresses, { label: '', address: '', city: '', department: '' }] })}>+ Añadir dirección</button>}</fieldset>
      <Button disabled={saving || !form.name.trim()}>{saving ? 'Guardando…' : 'Guardar cliente'}</Button>
      {message && <p role="status" className="text-emerald-300">{message}</p>}
      {saveError && <p role="alert" className="text-red-300">{saveError}</p>}
    </form>
  </SellerSection>
}
