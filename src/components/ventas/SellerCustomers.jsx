import { useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { Button, Input, Modal, MoneyInput, Select, Textarea, Badge } from '@/components/ui'
import CityAutocomplete from '@/components/shared/CityAutocomplete'
import PhoneField from '@/components/shared/PhoneField'
import EmailField from '@/components/shared/EmailField'
import ListGridToggle from '@/components/shared/ListGridToggle'
import { telefonoValido, MENSAJE_TELEFONO } from '@/utils/telefono'
import { coincideCliente } from '@/utils/cliente'
import { capitalizarPrimera } from '@/utils/texto'
import { parseDelimited } from '@/utils/csv'
import { descargarCsv } from '@/utils/descargarCsv'
import { cn } from '@/lib/utils'

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
import { useBusquedaDiferida } from '@/hooks/useBusquedaDiferida'
import CustomerCommunicationCard from '@/components/customers/CustomerCommunicationCard'
import ClientesTabla from '@/components/customers/ClientesTabla'
import CustomerProfile from '@/components/customers/CustomerProfile'
import { customerMetadata, DEMO_MESSAGE_TEMPLATES, readCustomerMetadata, whatsappUrl } from '@/components/customers/customerMessaging'

export const DEMO_CUSTOMERS_KEY = 'mobos:demo-customers:v1'
const emptyCustomer = { name: '', document: '', email: '', phones: [''], addresses: [{ label: 'Principal', address: '', city: '', department: '', country: 'Paraguay' }], acceptsEmailMarketing: false, acceptsSmsMarketing: false, acceptsWhatsappMarketing: false, taxExempt: false, tags: '', pricingTier: 'RETAIL', creditLimitPyg: '', creditDays: '' }
const FILTROS_CLIENTES = [['todos', 'Todos'], ['mayoristas', 'Mayoristas'], ['deuda', 'Con deuda'], ['credito', 'Con crédito']]
// Filtro local para la demo (sin API): espejo acotado del filtro del servidor.
const coincideFiltroCliente = (row, filtro) => {
  if (filtro === 'mayoristas') return row.wholesale === true || row.pricingTier === 'WHOLESALE'
  if (filtro === 'credito') return Number(row.creditLimitPyg || 0) > 0
  if (filtro === 'deuda') return Number(row.stats?.orders || 0) > 0
  return true
}
const templateFields = (row) => ({ id: row.id, key: row.key || '', name: row.name || 'Mensaje', body: row.body || '', category: row.category || '' })
const readDemoTemplates = () => DEMO_MESSAGE_TEMPLATES
export const customerFields = (row) => {
  const metadata = readCustomerMetadata(row.notes)
  const phone = row.phone || ''
  const phones = Array.from(new Set([phone, ...(row.phones || []), ...metadata.phones].filter(Boolean)))
  const legacyAddress = typeof row.notes === 'string' && row.notes.startsWith('Dirección: ') ? row.notes.slice('Dirección: '.length) : ''
  const addresses = Array.isArray(row.addresses) ? row.addresses : row.address || legacyAddress ? [{ id: 'legacy', label: 'Principal', address: row.address || legacyAddress }] : []
  return { id: row.id, name: row.name || '', document: row.document || '', email: row.email || '', phone, phones, countryCode: row.countryCode || '+595', billingName: row.billingName || '', billingDocument: row.billingDocument || '', notes: typeof row.notes === 'string' ? row.notes : '', address: addresses[0]?.address || '', addresses, externalId: row.externalId || '', acceptsEmailMarketing: row.acceptsEmailMarketing === true, acceptsSmsMarketing: row.acceptsSmsMarketing === true, acceptsWhatsappMarketing: row.acceptsWhatsappMarketing === true, taxExempt: row.taxExempt === true, tags: Array.isArray(row.tags) ? row.tags : [], pricingTier: row.pricingTier || 'RETAIL', creditLimitPyg: row.creditLimitPyg ?? null, creditDays: row.creditDays ?? null }
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
  const busquedaDiferida = useBusquedaDiferida(query)
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
  const [filtro, setFiltro] = useState('todos')
  const [exportando, setExportando] = useState(false)
  const [exportError, setExportError] = useState('')
  const nombreRef = useRef(null)
  useEffect(() => { setSearch(busquedaDiferida.trim()) }, [busquedaDiferida])
  // Búsqueda y filtros van al servidor (cubren todas las fichas del tenant, no
  // solo la página cargada); el hook pagina con cursor para "Cargar más".
  const path = useMemo(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (filtro !== 'todos') params.set('filtro', filtro)
    const consulta = params.toString()
    return `/api/customers${consulta ? `?${consulta}` : ''}`
  }, [search, filtro])
  const data = useSellerData(path, customerFields, readDemoCustomers, esDemo, { limit: 50 })
  const templateData = useSellerData('/api/message-templates', templateFields, readDemoTemplates, esDemo)
  const rows = esDemo ? data.rows.filter((row) => coincideCliente(row, search) && coincideFiltroCliente(row, filtro)) : data.rows

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
      if (phones.some((phone) => !telefonoValido(phone, form.countryCode || '+595'))) throw new Error(MENSAJE_TELEFONO)
      const addresses = form.addresses.filter((address) => address.address.trim()).map((address, index) => ({ label: address.label.trim() || `Dirección ${index + 1}`, address: address.address.trim(), ...(address.city.trim() ? { city: address.city.trim() } : {}), ...(address.department?.trim() ? { department: address.department.trim() } : {}), country: address.country?.trim() || 'Paraguay', isDefault: index === 0 }))
      if (esDemo) {
        const customer = { id: crypto.randomUUID(), name: form.name.trim(), document: form.document.trim(), email: form.email.trim(), phone: phones[0] || '', phones, countryCode: form.countryCode || '+595', addresses, acceptsEmailMarketing: form.acceptsEmailMarketing, acceptsSmsMarketing: form.acceptsSmsMarketing, acceptsWhatsappMarketing: form.acceptsWhatsappMarketing, taxExempt: form.taxExempt, tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 20) }
        localStorage.setItem(DEMO_CUSTOMERS_KEY, JSON.stringify([...readDemoCustomers(), customer]))
      } else {
        const saved = await api.post('/api/customers', { name: form.name.trim(), document: form.document.trim() || undefined, email: form.email.trim() || undefined, phone: phones[0] || undefined, countryCode: form.countryCode || '+595', addresses, notes: customerMetadata(phones), acceptsEmailMarketing: form.acceptsEmailMarketing, acceptsSmsMarketing: form.acceptsSmsMarketing, acceptsWhatsappMarketing: form.acceptsWhatsappMarketing, taxExempt: form.taxExempt, tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 20), pricingTier: form.pricingTier === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL', ...(String(form.creditLimitPyg).trim() ? { creditLimitPyg: Number(String(form.creditLimitPyg).replace(/\D/g, '')) } : {}), ...(String(form.creditDays).trim() ? { creditDays: Number(String(form.creditDays).replace(/\D/g, '')) } : {}) })
        if (!saved?.id) throw new Error('Sin confirmación')
      }
      setForm(emptyCustomer); setRucResult(null); setRucError(''); setSearch(''); setQuery(''); setCrearAbierto(false); data.refresh()
      setMessage(esDemo ? 'Cliente de prueba guardado en este navegador.' : 'Cliente guardado.')
    } catch (cause) {
      setSaveError(cause?.message || 'No se pudo confirmar el guardado. Buscá el cliente antes de reintentar.')
    } finally { savingRef.current = false; setSaving(false) }
  }

  async function exportar() {
    if (esDemo) return
    setExportando(true); setExportError('')
    try {
      await descargarCsv('customers', { q: search || undefined, filtro: filtro !== 'todos' ? filtro : undefined }, 'mobos-clientes.csv')
    } catch (cause) { setExportError(cause?.message || 'No se pudo exportar el CSV.') } finally { setExportando(false) }
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
  // El módulo de clientes usa solo las plantillas de su contexto; las demo
  // (sin categoría) siguen disponibles tal cual.
  const plantillasClientes = templateData.rows.filter((item) => !item.category || item.category === 'CUSTOMERS')
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


  return <SellerSection title="Clientes" description={esDemo ? 'Demo local: ingresá únicamente datos ficticios.' : 'Buscá por nombre, teléfono, RUC, correo o ciudad. Filtrá y cargá más resultados.'}>
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1">{FILTROS_CLIENTES.map(([key, label]) => <button key={key} type="button" aria-pressed={filtro === key} onClick={() => setFiltro(key)} className={cn('rounded-lg px-2.5 py-1.5 text-xs font-semibold transition', filtro === key ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore')}>{label}</button>)}</div>
      <form onSubmit={(event) => { event.preventDefault(); setSearch(busquedaDiferida.trim()) }} className="flex min-w-0 flex-1 gap-2">
        <Input aria-label="Buscar clientes" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, teléfono, RUC, correo o ciudad" />
        <Button>Buscar</Button>
      </form>
      <Select aria-label="Ordenar clientes" className="h-9 w-auto" value={orden} onChange={(event) => setOrden(event.target.value)}>
        <option value="recientes">Recientes</option>
        <option value="nombre">Nombre</option>
        <option value="total">Total gastado</option>
      </Select>
      <ListGridToggle value={vista} onChange={(next) => { setVista(next); localStorage.setItem('mobos:clientes-vista', next) }} />
      <Button type="button" onClick={abrirCrear}>+ Crear cliente</Button>
      {!esDemo && <Button type="button" variant="outline" className="h-9 px-3 text-xs" disabled={exportando} onClick={exportar}><Icon name="download" className="h-4 w-4" />Exportar CSV</Button>}
      {!esDemo && <Button type="button" variant="outline" onClick={() => { setImportAbierto(true); setImportError(''); setImportResultado(null) }}>Importar</Button>}
    </div>
    {exportError && <p role="alert" className="text-sm text-bad">{exportError}</p>}
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
            {seguimiento.customer?.phone && <a className="grid h-7 w-7 place-items-center rounded-lg border border-ok/30 text-ok transition hover:bg-ok/10 active:scale-95" title={`Abrir WhatsApp con ${seguimiento.customer.name}`} aria-label={`Abrir WhatsApp con ${seguimiento.customer.name}`} href={whatsappUrl(seguimiento.customer.phone, `Hola ${seguimiento.customer.name}, te escribimos de MobOS.`, seguimiento.customer.countryCode)} target="_blank" rel="noopener noreferrer"><Icon name="send" className="h-4 w-4" /></a>}
          </article>
        ))}</div>
      </section>
    )}
    {!data.loading && !data.error && vista === 'grid' && <ul className="grid gap-3 sm:grid-cols-2">{ordenados.map((row) => <CustomerCommunicationCard key={row.id} customer={row} templates={plantillasClientes} onViewProfile={esDemo ? undefined : setProfileCustomer} />)}</ul>}
    {!data.loading && !data.error && vista === 'list' && <ClientesTabla rows={ordenados} templates={plantillasClientes} onPerfil={esDemo ? undefined : setProfileCustomer} />}
    {!data.loading && !data.error && data.hayMas && <div className="flex justify-center pt-1"><button type="button" disabled={data.cargandoMas} onClick={data.cargarMas} className="rounded-lg border border-ink-500 px-4 py-2 text-xs font-semibold text-mute transition hover:border-fono hover:text-fore disabled:opacity-60">{data.cargandoMas ? 'Cargando…' : 'Cargar más clientes'}</button></div>}
    <CustomerProfile customer={profileCustomer} open={Boolean(profileCustomer)} onClose={() => setProfileCustomer(null)} />
    {!templateData.loading && templateData.error && <p className="rounded-xl border border-amber-400/30 bg-amber-300/10 p-3 text-sm text-warn">No se pudieron cargar las plantillas. Podés seguir gestionando clientes.</p>}
    <Modal open={importAbierto} onClose={() => !importBusy && setImportAbierto(false)} title="Importar clientes" className="max-w-2xl">
      <form onSubmit={importar} className="space-y-3">
        <p className="text-sm text-mute">Pegá las filas del export (la primera línea son los encabezados). Se reconocen: Customer ID, First/Last Name, Email, Phone, Default Address (Company, Address1, Address2, City), Note y Tags. Los duplicados por RUC, teléfono o ID no se vuelven a crear.</p>
        <Textarea aria-label="Filas del export a importar" rows={10} className="font-mono text-xs" value={importTexto} onChange={(event) => setImportTexto(event.target.value)} placeholder={'Customer ID\tFirst Name\tLast Name\tEmail\t…'} />
        {filasImportadas.length > 0 && !importResultado && <p className="text-xs text-fono-light">Se detectaron {filasImportadas.length} filas para importar.</p>}
        {importError && <p role="alert" className="text-sm text-bad">{importError}</p>}
        {importResultado && <p role="status" className="rounded-lg border border-ok/30 bg-ok/10 p-3 text-sm text-ok">{importResultado.created} clientes creados · {importResultado.skipped} omitidos (duplicados o inválidos) · {importResultado.total} filas procesadas.</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" disabled={importBusy} onClick={() => setImportAbierto(false)}>Cerrar</Button><Button type="submit" disabled={importBusy || !filasImportadas.length}>{importBusy ? 'Importando…' : 'Importar clientes'}</Button></div>
      </form>
    </Modal>
    <Modal open={crearAbierto} onClose={() => !saving && setCrearAbierto(false)} title="Crear cliente" className="max-w-2xl">
      <form onSubmit={create} className="space-y-4">
        <label className="block space-y-2"><span>Nombre</span><Input ref={nombreRef} required autoFocus maxLength={120} disabled={saving} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-2"><span>RUC o CI <small className="text-mute">(opcional)</small></span><Input maxLength={100} disabled={saving} value={form.document} onChange={(event) => { setForm({ ...form, document: event.target.value }); setRucResult(null); setRucError('') }} placeholder="80012345-6" /></label><label className="block space-y-2"><span>Correo <small className="text-mute">(opcional)</small></span><EmailField maxLength={200} disabled={saving} value={form.email} onChange={value => setForm({ ...form, email: value })} placeholder="cliente@correo.com" /></label></div>
        {!esDemo && <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={saving || rucLoading || !form.document.trim()} className="rounded-xl border border-fono/40 px-3 py-2 text-sm font-semibold text-fono-light disabled:opacity-40" onClick={lookupRuc}>{rucLoading ? 'Consultando RUC…' : 'Consultar RUC'}</button><span className="text-xs text-mute">La razón social se aplica solo si la confirmás.</span></div>}
        {rucResult && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-fono/25 bg-fono/5 p-3 text-sm"><span><b>{rucResult.name}</b><br /><span className="text-mute">RUC {rucResult.fullRuc}</span></span><button type="button" className="font-semibold text-fono-light" onClick={() => { setForm({ ...form, name: rucResult.name, document: rucResult.fullRuc || form.document }); setRucResult(null) }}>Usar estos datos</button></div>}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block space-y-2"><span>Precio</span><Select value={form.pricingTier} onChange={(event) => setForm({ ...form, pricingTier: event.target.value })}><option value="RETAIL">Minorista</option><option value="WHOLESALE">Mayorista</option></Select></label>
          <label className="block space-y-2"><span>Límite de crédito (Gs)</span><MoneyInput disabled={saving} value={form.creditLimitPyg} onValueChange={(value) => setForm({ ...form, creditLimitPyg: value })} placeholder="0 = sin crédito" /></label>
          <label className="block space-y-2"><span>Plazo de crédito (días)</span><Input inputMode="numeric" disabled={saving} value={form.creditDays} onChange={(event) => setForm({ ...form, creditDays: event.target.value.replace(/\D/g, '') })} placeholder="Ej. 30" /></label>
        </div>
        {rucError && <p role="alert" className="text-sm text-bad">{rucError}</p>}
        <fieldset className="space-y-2"><legend>Teléfonos</legend>{form.phones.map((phone, index) => <div className="flex gap-2" key={`phone-${index}`}><PhoneField className="min-w-0 flex-1" countryCode={form.countryCode || '+595'} phone={phone} disabled={saving} placeholder={index === 0 ? '0981 123 456' : 'Otro teléfono'} phoneAriaLabel={index === 0 ? 'Teléfono' : 'Otro teléfono'} onCountryCodeChange={(countryCode) => setForm({ ...form, countryCode })} onChange={(value) => setForm({ ...form, phones: form.phones.map((item, itemIndex) => itemIndex === index ? value : item) })} />{form.phones.length > 1 && <button type="button" className="rounded-xl border border-fore/15 px-3 text-sm" onClick={() => setForm({ ...form, phones: form.phones.filter((_, itemIndex) => itemIndex !== index) })}>Quitar</button>}</div>)}{form.phones.length < 5 && <button type="button" className="text-sm font-semibold text-fono-light" onClick={() => setForm({ ...form, phones: [...form.phones, ''] })}>+ Añadir teléfono</button>}</fieldset>
        <fieldset className="space-y-3"><legend>Direcciones</legend>{form.addresses.map((address, index) => <div className="grid gap-2 rounded-xl border border-fore/10 p-3 sm:grid-cols-2" key={`address-${index}`}><div className="flex gap-2"><Input maxLength={80} disabled={saving} value={address.label} placeholder="Etiqueta: Casa, oficina…" onChange={(event) => setForm({ ...form, addresses: form.addresses.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} /><Input maxLength={100} disabled={saving} autoCapitalize="words" value={address.country ?? 'Paraguay'} placeholder="País" aria-label="País" onChange={(event) => setForm({ ...form, addresses: form.addresses.map((item, itemIndex) => itemIndex === index ? { ...item, country: capitalizarPrimera(event.target.value) } : item) })} /></div><div className="space-y-1"><CityAutocomplete esDemo={esDemo} disabled={saving} value={address.city || ''} onSelect={(city, department) => setForm({ ...form, addresses: form.addresses.map((item, itemIndex) => itemIndex === index ? { ...item, city, department } : item) })} />{address.department && <p className="px-1 text-xs text-fono-light">Departamento: {address.department}</p>}</div><Input maxLength={400} className="sm:col-span-2" disabled={saving} autoCapitalize="sentences" value={address.address} placeholder={esDemo ? 'Dirección de prueba' : 'Dirección completa'} onChange={(event) => setForm({ ...form, addresses: form.addresses.map((item, itemIndex) => itemIndex === index ? { ...item, address: capitalizarPrimera(event.target.value) } : item) })} />{form.addresses.length > 1 && <button type="button" className="text-left text-sm text-bad" onClick={() => setForm({ ...form, addresses: form.addresses.filter((_, itemIndex) => itemIndex !== index) })}>Quitar dirección</button>}</div>)}{form.addresses.length < 10 && <button type="button" className="text-sm font-semibold text-fono-light" onClick={() => setForm({ ...form, addresses: [...form.addresses, { label: '', address: '', city: '', department: '', country: 'Paraguay' }] })}>+ Añadir dirección</button>}</fieldset>
        <div className="grid gap-3 rounded-xl border border-fore/10 p-3 sm:grid-cols-2">
          <fieldset className="space-y-1.5"><legend className="text-xs font-bold uppercase tracking-wider text-mute">Marketing (solo si acepta)</legend>{[['acceptsWhatsappMarketing', 'WhatsApp'], ['acceptsSmsMarketing', 'SMS'], ['acceptsEmailMarketing', 'Email']].map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={saving} checked={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.checked })} />{label}</label>)}</fieldset>
          <div className="space-y-3"><label className="block space-y-2"><span>Tipo de cliente</span><Select disabled={saving} value={form.pricingTier} onChange={(event) => setForm({ ...form, pricingTier: event.target.value })}><option value="RETAIL">Cliente final</option><option value="WHOLESALE">Mayorista (precio mayorista en el POS)</option></Select></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={saving} checked={form.taxExempt} onChange={(event) => setForm({ ...form, taxExempt: event.target.checked })} />Exento de impuestos</label><label className="block space-y-2"><span>Etiquetas <small className="text-mute">(separadas por coma)</small></span><Input maxLength={200} disabled={saving} value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="Ej: mayorista, prioridad" /></label></div>
        </div>
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={() => setCrearAbierto(false)}>Cancelar</Button><Button disabled={saving || !form.name.trim()}>{saving ? 'Guardando…' : 'Guardar cliente'}</Button></div>
        {message && <p role="status" className="text-ok">{message}</p>}
        {saveError && <p role="alert" className="text-bad">{saveError}</p>}
      </form>
    </Modal>
  </SellerSection>
}
