import { useEffect, useRef, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { Button, Input, Modal, Select, Badge } from '@/components/ui'
import { gs } from '@/utils/calculos'
import CityAutocomplete from '@/components/shared/CityAutocomplete'
import ListGridToggle from '@/components/shared/ListGridToggle'
import { telefonoValido, MENSAJE_TELEFONO } from '@/utils/telefono'
import { parseDelimited } from '@/utils/csv'

const RUC_RE = /\d[\d.\s]{2,}-\d+/

// Convierte filas del export tipo Shopify en fichas para el endpoint de import.
function filasParaImportar(texto) {
  const filas = parseDelimited(texto)
  if (filas.length < 2) return []
  const encabezados = (filas[0] || []).map((celda) => String(celda).trim())
  const comoFila = (fila) => Object.fromEntries(encabezados.map((clave, indice) => [clave, String(fila[indice] ?? '').trim()]))
  return filas.slice(1).map(comoFila).map((row) => {
    const nombre = `${row['First Name'] || ''} ${row['Last Name'] || ''}`.trim()
    const telefono = String(row['Phone'] || row['Default Address Phone'] || '').replace(/[\s-]/g, '')
    const rucFuente = `${row['Default Address Company'] || ''} ${row['Note'] || ''} ${row['Default Address Address1'] || ''}`
    const documento = (rucFuente.match(RUC_RE) || [null])[0]
    const direccion = `${row['Default Address Address1'] || ''} ${row['Default Address Address2'] || ''}`.trim()
    const ciudad = row['Default Address City'] || ''
    const tags = String(row['Tags'] || '').split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 20)
    return {
      name: nombre || telefono || '',
      document: documento || undefined,
      phone: telefono || undefined,
      email: row['Email'] || undefined,
      externalId: row['Customer ID'] || undefined,
      tags,
      addresses: (direccion || ciudad) ? [{ label: 'Principal', address: direccion || 'Sin dirección', ...(ciudad ? { city: ciudad } : {}), country: 'Paraguay', isDefault: true }] : [],
    }
  }).filter((row) => row.name || row.phone)
}
import { SellerFeedback, SellerSection, useSellerData } from './SellerData'
import CustomerCommunicationCard from '@/components/customers/CustomerCommunicationCard'
import CustomerProfile from '@/components/customers/CustomerProfile'
import { customerMetadata, DEMO_MESSAGE_TEMPLATES, readCustomerMetadata, whatsappUrl } from '@/components/customers/customerMessaging'

export const DEMO_CUSTOMERS_KEY = 'mobos:demo-customers:v1'
const emptyCustomer = { name: '', document: '', email: '', phones: [''], addresses: [{ label: 'Principal', address: '', city: '', department: '', country: 'Paraguay' }], acceptsEmailMarketing: false, acceptsSmsMarketing: false, acceptsWhatsappMarketing: false, taxExempt: false, tags: '', pricingTier: 'RETAIL', creditLimitPyg: '', creditDays: '' }
const templateFields = (row) => ({ id: row.id, name: row.name || 'Mensaje', body: row.body || '' })
const readDemoTemplates = () => DEMO_MESSAGE_TEMPLATES
export const customerFields = (row) => {
  const metadata = readCustomerMetadata(row.notes)
  const phone = row.phone || ''
  const phones = Array.from(new Set([phone, ...(row.phones || []), ...metadata.phones].filter(Boolean)))
  const legacyAddress = typeof row.notes === 'string' && row.notes.startsWith('Dirección: ') ? row.notes.slice('Dirección: '.length) : ''
  const addresses = Array.isArray(row.addresses) ? row.addresses : row.address || legacyAddress ? [{ id: 'legacy', label: 'Principal', address: row.address || legacyAddress }] : []
  return { id: row.id, name: row.name || '', document: row.document || '', email: row.email || '', phone, phones, countryCode: row.countryCode || '+595', address: addresses[0]?.address || '', addresses, externalId: row.externalId || '', acceptsEmailMarketing: row.acceptsEmailMarketing === true, acceptsSmsMarketing: row.acceptsSmsMarketing === true, acceptsWhatsappMarketing: row.acceptsWhatsappMarketing === true, taxExempt: row.taxExempt === true, tags: Array.isArray(row.tags) ? row.tags : [], pricingTier: row.pricingTier || 'RETAIL', creditLimitPyg: row.creditLimitPyg ?? null, creditDays: row.creditDays ?? null }
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
  const [crearAbierto, setCrearAbierto] = useState(false)
  const [importAbierto, setImportAbierto] = useState(false)
  const [importTexto, setImportTexto] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [importResultado, setImportResultado] = useState(null)
  const [importError, setImportError] = useState('')
  const [seguimientos, setSeguimientos] = useState([])
  const [vista, setVista] = useState(() => localStorage.getItem('mobos:clientes-vista') || 'grid')
  const [orden, setOrden] = useState('recientes')
  const [resumen, setResumen] = useState(null)
  const nombreRef = useRef(null)
  const data = useSellerData(`/api/customers?q=${encodeURIComponent(search)}`, customerFields, readDemoCustomers, esDemo)
  const templateData = useSellerData('/api/message-templates', templateFields, readDemoTemplates, esDemo)
  const rows = esDemo ? data.rows.filter((row) => `${row.name} ${(row.phones || []).join(' ')}`.toLowerCase().includes(search.toLowerCase())) : data.rows

  useEffect(() => {
    function onNewCustomer() {
      delete window.__mobosNewCustomer
      setForm(emptyCustomer)
      setRucResult(null)
      setRucError('')
      setSaveError('')
      setMessage('')
      setCrearAbierto(true)
    }
    if (window.__mobosNewCustomer) onNewCustomer()
    window.addEventListener('mobos:new-customer', onNewCustomer)
    return () => window.removeEventListener('mobos:new-customer', onNewCustomer)
  }, [])

  function abrirCrear() {
    setForm(emptyCustomer)
    setRucResult(null)
    setRucError('')
    setSaveError('')
    setMessage('')
    setCrearAbierto(true)
  }

  async function create(event) {
    event.preventDefault()
    if (savingRef.current || !form.name.trim()) return
    savingRef.current = true
    setSaving(true); setMessage(''); setSaveError('')
    try {
      const phones = form.phones.map((phone) => phone.trim()).filter(Boolean).slice(0, 5)
      if (phones.some((phone) => !telefonoValido(phone))) throw new Error(MENSAJE_TELEFONO)
      const addresses = form.addresses.filter((address) => address.address.trim()).map((address, index) => ({ label: address.label.trim() || `Dirección ${index + 1}`, address: address.address.trim(), ...(address.city.trim() ? { city: address.city.trim() } : {}), ...(address.department?.trim() ? { department: address.department.trim() } : {}), country: address.country?.trim() || 'Paraguay', isDefault: index === 0 }))
      if (esDemo) {
        const customer = { id: crypto.randomUUID(), name: form.name.trim(), document: form.document.trim(), email: form.email.trim(), phone: phones[0] || '', phones, countryCode: '+595', addresses, acceptsEmailMarketing: form.acceptsEmailMarketing, acceptsSmsMarketing: form.acceptsSmsMarketing, acceptsWhatsappMarketing: form.acceptsWhatsappMarketing, taxExempt: form.taxExempt, tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 20) }
        localStorage.setItem(DEMO_CUSTOMERS_KEY, JSON.stringify([...readDemoCustomers(), customer]))
      } else {
        const saved = await api.post('/api/customers', { name: form.name.trim(), document: form.document.trim() || undefined, email: form.email.trim() || undefined, phone: phones[0] || undefined, countryCode: '+595', addresses, notes: customerMetadata(phones), acceptsEmailMarketing: form.acceptsEmailMarketing, acceptsSmsMarketing: form.acceptsSmsMarketing, acceptsWhatsappMarketing: form.acceptsWhatsappMarketing, taxExempt: form.taxExempt, tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 20), pricingTier: form.pricingTier === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL', ...(String(form.creditLimitPyg).trim() ? { creditLimitPyg: Number(String(form.creditLimitPyg).replace(/\D/g, '')) } : {}), ...(String(form.creditDays).trim() ? { creditDays: Number(String(form.creditDays).replace(/\D/g, '')) } : {}) })
        if (!saved?.id) throw new Error('Sin confirmación')
      }
      setForm(emptyCustomer); setRucResult(null); setRucError(''); setSearch(''); setQuery(''); setCrearAbierto(false); data.refresh()
      setMessage(esDemo ? 'Cliente de prueba guardado en este navegador.' : 'Cliente guardado.')
    } catch (cause) {
      setSaveError(cause?.message || 'No se pudo confirmar el guardado. Buscá el cliente antes de reintentar.')
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

  async function importar(event) {
    event.preventDefault()
    if (importBusy || esDemo) return
    const filas = filasParaImportar(importTexto)
    if (!filas.length) { setImportError('No se detectaron filas válidas. La primera línea debe tener los encabezados.'); return }
    setImportBusy(true); setImportError(''); setImportResultado(null)
    try {
      const resultado = await api.post('/api/customers', { rows: filas.slice(0, 500) })
      setImportResultado(resultado)
      setImportTexto('')
      data.refresh()
    } catch (cause) { setImportError(cause?.message || 'No se pudo importar.') } finally { setImportBusy(false) }
  }

  const filasImportadas = filasParaImportar(importTexto)
  const resumenMostrar = esDemo ? { total: rows.length, wholesalers: rows.filter((row) => row.wholesale).length, retail: rows.filter((row) => !row.wholesale).length } : resumen
  const ordenados = [...rows].sort((a, b) => {
    if (orden === 'nombre') return a.name.localeCompare(b.name)
    if (orden === 'total') return Number(b.stats?.totalSpentPyg || 0) - Number(a.stats?.totalSpentPyg || 0)
    const ultimo = (fila) => fila.stats?.lastOrderAt ? new Date(fila.stats.lastOrderAt).getTime() : fila.createdAt ? new Date(fila.createdAt).getTime() : 0
    return ultimo(b) - ultimo(a)
  })

  useEffect(() => {
    if (esDemo) return
    api.get('/api/follow-ups?due=today').then(setSeguimientos).catch(() => setSeguimientos([]))
    api.get('/api/customers/summary').then(setResumen).catch(() => setResumen(null))
  }, [esDemo])


  return <SellerSection title="Clientes" description={esDemo ? 'Demo local: ingresá únicamente datos ficticios.' : 'Buscá por nombre o teléfono. La API devuelve hasta 50 coincidencias.'}>
    <div className="flex flex-wrap items-center gap-2">
      <form onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); data.refresh() }} className="flex min-w-0 flex-1 gap-2">
        <Input aria-label="Buscar clientes" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o teléfono" />
        <Button>Buscar</Button>
      </form>
      <Select aria-label="Ordenar clientes" className="h-9 w-auto" value={orden} onChange={(event) => setOrden(event.target.value)}>
        <option value="recientes">Recientes</option>
        <option value="nombre">Nombre</option>
        <option value="total">Total gastado</option>
      </Select>
      <ListGridToggle value={vista} onChange={(next) => { setVista(next); localStorage.setItem('mobos:clientes-vista', next) }} />
      <Button type="button" onClick={abrirCrear}>+ Crear cliente</Button>
      {!esDemo && <Button type="button" variant="outline" onClick={() => { setImportAbierto(true); setImportError(''); setImportResultado(null) }}>Importar</Button>}
    </div>
    {resumenMostrar && <div className="flex flex-wrap items-center gap-2 text-sm"><Badge color="blue">{resumenMostrar.total} clientes</Badge><Badge color="orange">{resumenMostrar.wholesalers} mayoristas</Badge><Badge color="slate">{resumenMostrar.retail} cliente final</Badge></div>}
    <SellerFeedback {...data} empty={!rows.length} />
    {seguimientos.length > 0 && (
      <section className="rounded-xl border border-warn/25 bg-warn/5 p-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-warn">Seguimientos para hoy ({seguimientos.length})</h3>
        <div className="mt-2 space-y-2">{seguimientos.map((seguimiento) => (
          <article key={seguimiento.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-600 p-2.5">
            <div className="min-w-0">
              <b className="text-sm">{seguimiento.customer?.name || 'Cliente'}</b>
              <p className="mt-0.5 text-xs text-mute">{seguimiento.kind === 'CALL' ? 'Llamada' : seguimiento.kind === 'WHATSAPP' ? 'WhatsApp' : seguimiento.kind === 'VISIT' ? 'Visita' : 'Otro'} · {seguimiento.dueAt ? new Date(seguimiento.dueAt).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin fecha'} · {seguimiento.note}</p>
            </div>
            {seguimiento.customer?.phone && <a className="rounded-lg bg-ok px-3 py-2 text-xs font-semibold text-black" href={whatsappUrl(seguimiento.customer.phone, `Hola ${seguimiento.customer.name}, te escribimos de MobOS.`, seguimiento.customer.countryCode)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
          </article>
        ))}</div>
      </section>
    )}
    {!data.loading && !data.error && vista === 'grid' && <ul className="grid gap-3 sm:grid-cols-2">{ordenados.map((row) => <CustomerCommunicationCard key={row.id} customer={row} templates={templateData.rows} onViewProfile={esDemo ? undefined : setProfileCustomer} />)}</ul>}
    {!data.loading && !data.error && vista === 'list' && <ul className="space-y-2">{ordenados.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 p-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><b className="truncate text-sm">{row.name}</b><Badge color={row.wholesale ? 'blue' : 'slate'}>{row.wholesale ? 'Mayorista' : 'Cliente final'}</Badge></div><p className="mt-0.5 font-mono text-[11px] text-mute">ID …{String(row.id || '').slice(-6)}{row.phone ? ` · ${row.phone}` : ''}</p><p className="mt-1 text-xs text-mute">{row.stats ? `${row.stats.orders} pedido${row.stats.orders === 1 ? '' : 's'} · total ${gs(row.stats.totalSpentPyg || 0)} · último ${row.stats.lastOrderAt ? new Date(row.stats.lastOrderAt).toLocaleDateString('es-PY') : '—'} · registrado ${row.createdAt ? new Date(row.createdAt).toLocaleDateString('es-PY') : '—'}` : `Registrado ${row.createdAt ? new Date(row.createdAt).toLocaleDateString('es-PY') : '—'}`}</p></div><div className="flex shrink-0 gap-2">{!esDemo && <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => setProfileCustomer(row)}>Ver perfil</Button>}{row.phones?.[0] && <a className="rounded-lg bg-ok px-3 py-2 text-xs font-semibold text-black" href={`https://wa.me/${String(row.countryCode || '+595').replace(/\D/g, '')}${String(row.phones[0]).replace(/\D/g, '').replace(/^0+/, '')}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}</div></li>)}</ul>}
    <CustomerProfile customer={profileCustomer} open={Boolean(profileCustomer)} onClose={() => setProfileCustomer(null)} />
    {!templateData.loading && templateData.error && <p className="rounded-xl border border-amber-400/30 bg-amber-300/10 p-3 text-sm text-amber-100">No se pudieron cargar las plantillas. Podés seguir gestionando clientes.</p>}
    <Modal open={importAbierto} onClose={() => !importBusy && setImportAbierto(false)} title="Importar clientes" className="max-w-2xl">
      <form onSubmit={importar} className="space-y-3">
        <p className="text-sm text-mute">Pegá las filas del export (la primera línea son los encabezados). Se reconocen: Customer ID, First/Last Name, Email, Phone, Default Address (Company, Address1, Address2, City), Note y Tags. Los duplicados por RUC, teléfono o ID no se vuelven a crear.</p>
        <textarea rows={10} className="w-full rounded-xl border border-ink-500 bg-paper p-3 font-mono text-xs text-fore outline-none focus:border-fono" value={importTexto} onChange={(event) => setImportTexto(event.target.value)} placeholder={'Customer ID\tFirst Name\tLast Name\tEmail\t…'} />
        {filasImportadas.length > 0 && !importResultado && <p className="text-xs text-fono-light">Se detectaron {filasImportadas.length} filas para importar.</p>}
        {importError && <p role="alert" className="text-sm text-red-300">{importError}</p>}
        {importResultado && <p role="status" className="rounded-lg border border-ok/30 bg-ok/10 p-3 text-sm text-ok">{importResultado.created} clientes creados · {importResultado.skipped} omitidos (duplicados o inválidos) · {importResultado.total} filas procesadas.</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" disabled={importBusy} onClick={() => setImportAbierto(false)}>Cerrar</Button><Button type="submit" disabled={importBusy || !filasImportadas.length}>{importBusy ? 'Importando…' : 'Importar clientes'}</Button></div>
      </form>
    </Modal>
    <Modal open={crearAbierto} onClose={() => !saving && setCrearAbierto(false)} title="Crear cliente" className="max-w-2xl">
      <form onSubmit={create} className="space-y-4">
        <label className="block space-y-2"><span>Nombre</span><Input ref={nombreRef} required autoFocus maxLength={120} disabled={saving} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-2"><span>RUC o CI <small className="text-mute">(opcional)</small></span><Input maxLength={100} disabled={saving} value={form.document} onChange={(event) => { setForm({ ...form, document: event.target.value }); setRucResult(null); setRucError('') }} placeholder="80012345-6" /></label><label className="block space-y-2"><span>Correo <small className="text-mute">(opcional)</small></span><Input type="email" maxLength={200} disabled={saving} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="cliente@correo.com" /></label></div>
        {!esDemo && <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={saving || rucLoading || !form.document.trim()} className="rounded-xl border border-fono/40 px-3 py-2 text-sm font-semibold text-fono-light disabled:opacity-40" onClick={lookupRuc}>{rucLoading ? 'Consultando RUC…' : 'Consultar RUC'}</button><span className="text-xs text-mute">La razón social se aplica solo si la confirmás.</span></div>}
        {rucResult && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-fono/25 bg-fono/5 p-3 text-sm"><span><b>{rucResult.name}</b><br /><span className="text-mute">RUC {rucResult.fullRuc}</span></span><button type="button" className="font-semibold text-fono-light" onClick={() => { setForm({ ...form, name: rucResult.name, document: rucResult.fullRuc || form.document }); setRucResult(null) }}>Usar estos datos</button></div>}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block space-y-2"><span>Precio</span><select className="min-h-11 w-full rounded-xl border border-ink-500 bg-ink-800 px-3 text-sm" value={form.pricingTier} onChange={(event) => setForm({ ...form, pricingTier: event.target.value })}><option value="RETAIL">Minorista</option><option value="WHOLESALE">Mayorista</option></select></label>
          <label className="block space-y-2"><span>Límite de crédito (Gs)</span><Input inputMode="numeric" disabled={saving} value={form.creditLimitPyg} onChange={(event) => setForm({ ...form, creditLimitPyg: event.target.value.replace(/\D/g, '') })} placeholder="0 = sin crédito" /></label>
          <label className="block space-y-2"><span>Plazo de crédito (días)</span><Input inputMode="numeric" disabled={saving} value={form.creditDays} onChange={(event) => setForm({ ...form, creditDays: event.target.value.replace(/\D/g, '') })} placeholder="Ej. 30" /></label>
        </div>
        {rucError && <p role="alert" className="text-sm text-red-300">{rucError}</p>}
        <fieldset className="space-y-2"><legend>Teléfonos</legend>{form.phones.map((phone, index) => <div className="flex gap-2" key={`phone-${index}`}><Input type="tel" maxLength={30} disabled={saving} value={phone} placeholder={index === 0 ? '0981 123 456' : 'Otro teléfono'} onChange={(event) => setForm({ ...form, phones: form.phones.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} />{form.phones.length > 1 && <button type="button" className="rounded-xl border border-fore/15 px-3 text-sm" onClick={() => setForm({ ...form, phones: form.phones.filter((_, itemIndex) => itemIndex !== index) })}>Quitar</button>}</div>)}{form.phones.length < 5 && <button type="button" className="text-sm font-semibold text-fono-light" onClick={() => setForm({ ...form, phones: [...form.phones, ''] })}>+ Añadir teléfono</button>}</fieldset>
        <fieldset className="space-y-3"><legend>Direcciones</legend>{form.addresses.map((address, index) => <div className="grid gap-2 rounded-xl border border-fore/10 p-3 sm:grid-cols-2" key={`address-${index}`}><div className="flex gap-2"><Input maxLength={80} disabled={saving} value={address.label} placeholder="Etiqueta: Casa, oficina…" onChange={(event) => setForm({ ...form, addresses: form.addresses.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} /><Input maxLength={100} disabled={saving} value={address.country || 'Paraguay'} placeholder="País" aria-label="País" onChange={(event) => setForm({ ...form, addresses: form.addresses.map((item, itemIndex) => itemIndex === index ? { ...item, country: event.target.value } : item) })} /></div><div className="space-y-1"><CityAutocomplete esDemo={esDemo} disabled={saving} value={address.city || ''} onSelect={(city, department) => setForm({ ...form, addresses: form.addresses.map((item, itemIndex) => itemIndex === index ? { ...item, city, department } : item) })} />{address.department && <p className="px-1 text-xs text-fono-light">Departamento: {address.department}</p>}</div><Input maxLength={400} className="sm:col-span-2" disabled={saving} value={address.address} placeholder={esDemo ? 'Dirección de prueba' : 'Dirección completa'} onChange={(event) => setForm({ ...form, addresses: form.addresses.map((item, itemIndex) => itemIndex === index ? { ...item, address: event.target.value } : item) })} />{form.addresses.length > 1 && <button type="button" className="text-left text-sm text-red-300" onClick={() => setForm({ ...form, addresses: form.addresses.filter((_, itemIndex) => itemIndex !== index) })}>Quitar dirección</button>}</div>)}{form.addresses.length < 10 && <button type="button" className="text-sm font-semibold text-fono-light" onClick={() => setForm({ ...form, addresses: [...form.addresses, { label: '', address: '', city: '', department: '', country: 'Paraguay' }] })}>+ Añadir dirección</button>}</fieldset>
        <div className="grid gap-3 rounded-xl border border-fore/10 p-3 sm:grid-cols-2">
          <fieldset className="space-y-1.5"><legend className="text-xs font-bold uppercase tracking-wider text-mute">Marketing (solo si acepta)</legend>{[['acceptsWhatsappMarketing', 'WhatsApp'], ['acceptsSmsMarketing', 'SMS'], ['acceptsEmailMarketing', 'Email']].map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={saving} checked={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.checked })} />{label}</label>)}</fieldset>
          <div className="space-y-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={saving} checked={form.taxExempt} onChange={(event) => setForm({ ...form, taxExempt: event.target.checked })} />Exento de impuestos</label><label className="block space-y-2"><span>Etiquetas <small className="text-mute">(separadas por coma)</small></span><Input maxLength={200} disabled={saving} value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="Ej: mayorista, prioridad" /></label></div>
        </div>
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={() => setCrearAbierto(false)}>Cancelar</Button><Button disabled={saving || !form.name.trim()}>{saving ? 'Guardando…' : 'Guardar cliente'}</Button></div>
        {message && <p role="status" className="text-emerald-300">{message}</p>}
        {saveError && <p role="alert" className="text-red-300">{saveError}</p>}
      </form>
    </Modal>
  </SellerSection>
}
