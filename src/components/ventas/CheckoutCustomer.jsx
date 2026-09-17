import { useEffect, useState } from 'react'
import { api } from '@/lib/api/client'
import { Button, Input } from '@/components/ui'
import CityAutocomplete from '@/components/shared/CityAutocomplete'
import PhoneField from '@/components/shared/PhoneField'
import Icon from '@/components/shared/Icon'

const emptyAddress = () => ({ label: 'Principal', address: '', city: '', department: '', country: 'Paraguay', notes: '', isDefault: true })
const customerValue = (customer) => ({
  id: customer.id, name: customer.name || '', phone: customer.phone || '', countryCode: customer.countryCode || '+595',
  email: customer.email || '', document: customer.document || '',
  pricingTier: customer.pricingTier || 'RETAIL', creditLimitPyg: customer.creditLimitPyg ?? null, creditDays: customer.creditDays ?? null,
  addresses: Array.isArray(customer.addresses) ? customer.addresses.map(({ id, ...address }) => address) : [],
})

export default function CheckoutCustomer({ value, onChange, esDemo, billingTo, onBillingChange }) {
  const [matches, setMatches] = useState([])
  const [error, setError] = useState('')
  const [rucLookup, setRucLookup] = useState(null)
  const [rucError, setRucError] = useState('')
  const [rucLoading, setRucLoading] = useState(false)
  const [billingLookup, setBillingLookup] = useState(null)
  const [billingRucError, setBillingRucError] = useState('')
  const [billingRucLoading, setBillingRucLoading] = useState(false)
  useEffect(() => {
    let active = true
    const query = (value.name || '').trim()
    if (!query) { setMatches([]); return () => { active = false } }
    const timer = setTimeout(async () => {
      try {
        const rows = esDemo ? JSON.parse(localStorage.getItem('mobos:demo-customers:v1') || '[]') : await api.get(`/api/customers?q=${encodeURIComponent(query)}`)
        if (active) { setMatches(rows.filter(customer => `${customer.name} ${customer.phone || ''} ${customer.document || ''}`.toLowerCase().includes(query.toLowerCase())).slice(0, 5)); setError('') }
      } catch { if (active) setError('No se pudo consultar clientes. Reintentá antes de confirmar.') }
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [value.name, esDemo])

  const set = (field) => (event) => onChange({ ...value, [field]: event.target.value })
  const setAddress = (index, field, next) => onChange({ ...value, addresses: value.addresses.map((address, position) => position === index ? { ...address, [field]: next } : address) })
  const addAddress = () => onChange({ ...value, addresses: [...(value.addresses || []), { ...emptyAddress(), label: `Dirección ${(value.addresses?.length || 0) + 1}`, isDefault: !value.addresses?.length }] })
  const removeAddress = (index) => onChange({ ...value, addresses: value.addresses.filter((_, position) => position !== index).map((address, position) => ({ ...address, isDefault: position === 0 ? true : address.isDefault })) })
  const consultRuc = async () => {
    if (!value.document?.trim()) return
    if (esDemo) { setRucError('La demo no consume consultas reales de RUC. Podés cargar los datos manualmente.'); return }
    setRucLoading(true); setRucError(''); setRucLookup(null)
    try { setRucLookup(await api.get(`/api/ruc?ruc=${encodeURIComponent(value.document)}`)) }
    catch (cause) { setRucError(cause?.message || 'No se pudo consultar el RUC. Podés continuar con carga manual.') }
    finally { setRucLoading(false) }
  }
  const applyRuc = () => {
    if (!rucLookup?.result) return
    onChange({ ...value, name: rucLookup.result.name || value.name, document: rucLookup.result.fullRuc || value.document })
  }
  const consultBillingRuc = async () => {
    if (!billingTo?.document?.trim()) return
    if (esDemo) { setBillingRucError('La demo no consume consultas reales de RUC. Podés cargar los datos manualmente.'); return }
    setBillingRucLoading(true); setBillingRucError(''); setBillingLookup(null)
    try { setBillingLookup(await api.get(`/api/ruc?ruc=${encodeURIComponent(billingTo.document)}`)) }
    catch (cause) { setBillingRucError(cause?.message || 'No se pudo consultar el RUC. Podés continuar con carga manual.') }
    finally { setBillingRucLoading(false) }
  }
  const applyBillingRuc = () => {
    if (!billingLookup?.result || !onBillingChange) return
    onBillingChange({ ...billingTo, name: billingLookup.result.name || billingTo.name, document: billingLookup.result.fullRuc || billingTo.document })
  }

  return <div className="space-y-3 md:col-span-2">
    <label className="block text-sm font-semibold">Cliente<Input aria-label="Nombre, teléfono, CI o RUC del cliente" value={value.name} placeholder="Buscar cliente o escribir un nombre nuevo" onChange={event => onChange({ ...value, id: undefined, name: event.target.value })} /></label>
    {!value.id && value.name && <div className="space-y-1">{matches.map(customer => <button type="button" key={customer.id} className="block w-full rounded-xl border border-ink-600 p-3 text-left text-sm hover:border-fono" onClick={() => onChange(customerValue(customer))}><strong>{customer.name}</strong><span className="ml-3 text-mute">{customer.phone || customer.document || 'Sin identificador'}</span>{customer.addresses?.length ? <span className="ml-2 text-xs text-fono-light">· {customer.addresses.length} dirección{customer.addresses.length === 1 ? '' : 'es'}</span> : null}</button>)}{!matches.length && !error && <p className="text-xs text-fono-light">Cliente nuevo: se creará automáticamente al confirmar la venta.</p>}</div>}
    {value.id && <div className="flex flex-wrap items-center gap-2 rounded-lg border border-fono/20 bg-fono/5 px-3 py-2 text-xs text-fono-light"><span>Cliente seleccionado.</span>{value.pricingTier === 'WHOLESALE' && <span className="rounded border border-fono/30 px-1.5 py-0.5 font-bold">Mayorista</span>}{Number(value.creditLimitPyg || 0) > 0 && <span className="rounded border border-warn/30 px-1.5 py-0.5 font-bold text-warn">Crédito hasta Gs. {Number(value.creditLimitPyg).toLocaleString('es-PY')}{value.creditDays ? ' · ' + value.creditDays + ' días' : ''}</span>}</div>}
    {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    <details className="rounded-xl border border-ink-600 p-3"><summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-fono-light"><Icon name="user" className="h-3.5 w-3.5" /> Datos de contacto, RUC/CI y direcciones</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="text-xs text-mute">Teléfono<PhoneField countryCode={value.countryCode || '+595'} phone={value.phone || ''} onCountryCodeChange={countryCode => onChange({ ...value, countryCode })} onChange={phone => onChange({ ...value, phone })} countryAriaLabel="Código de país" phoneAriaLabel="Teléfono del cliente" /></div>
        <label className="text-xs text-mute">CI o RUC<Input aria-label="CI o RUC del cliente" value={value.document || ''} onChange={event => { setRucLookup(null); setRucError(''); onChange({ ...value, document: event.target.value }) }} placeholder="80012345-6" /></label>
        <label className="text-xs text-mute">Correo<Input aria-label="Correo del cliente" type="email" value={value.email || ''} onChange={set('email')} placeholder="cliente@correo.com" /></label>
      </div>
      <div className="mt-3 rounded-xl border border-ink-600 bg-ink-800/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-sm">Consulta RUC Paraguay</strong><p className="mt-1 text-xs text-mute">Verificá los datos antes de aplicarlos. La consulta no guarda información por sí sola.</p></div><Button type="button" variant="outline" disabled={!value.document?.trim() || rucLoading} onClick={consultRuc}>{rucLoading ? 'Consultando…' : 'Consultar RUC'}</Button></div>
        {rucError && <p role="alert" className="mt-2 text-xs text-bad">{rucError}</p>}
        {rucLookup?.result && <div className="mt-3 rounded-lg border border-fono/25 bg-fono/5 p-3 text-sm"><p><strong>{rucLookup.result.name}</strong></p><p className="mt-1 text-xs text-mute">RUC {rucLookup.result.fullRuc}{rucLookup.result.state ? ` · ${rucLookup.result.state}` : ''}</p><p className="mt-2 text-xs text-mute">Fuente: {rucLookup.source.provider} · {new Date(rucLookup.source.queriedAt).toLocaleString('es-PY')}</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={applyRuc}>Aplicar nombre y RUC</Button><a className="self-center text-xs text-fono-light hover:underline" href={rucLookup.source.documentationUrl} target="_blank" rel="noreferrer">Fuente y documentación</a></div></div>}
      </div>
      <div className="mt-4 space-y-3"><div className="flex items-center justify-between"><strong className="text-sm">Direcciones</strong><Button type="button" variant="outline" onClick={addAddress}>+ Dirección</Button></div>        {!value.addresses?.length && <p className="text-xs text-mute">Sin dirección cargada. Podés continuar con retiro en tienda.</p>}
        {(value.addresses || []).map((address, index) => <div key={index} className="grid gap-2 rounded-xl border border-ink-600 p-3 sm:grid-cols-2"><div className="flex gap-2"><label className="text-xs text-mute">Etiqueta<Input value={address.label || ''} onChange={event => setAddress(index, 'label', event.target.value)} placeholder="Casa, trabajo…" /></label><label className="text-xs text-mute">País<Input maxLength={100} value={address.country || 'Paraguay'} onChange={event => setAddress(index, 'country', event.target.value)} placeholder="Paraguay" /></label></div><label className="text-xs text-mute">Ciudad<CityAutocomplete esDemo={esDemo} value={address.city || ''} onSelect={(city, department) => onChange({ ...value, addresses: value.addresses.map((item, position) => position === index ? { ...item, city, department } : item) })} placeholder="Asunción" />{address.department && <span className="block truncate px-1 pt-1 text-[11px] text-fono-light">{address.department}</span>}</label><label className="text-xs text-mute sm:col-span-2">Dirección<Input value={address.address || ''} onChange={event => setAddress(index, 'address', event.target.value)} placeholder="Calle, número y referencia" /></label><div className="flex items-center justify-between gap-2 sm:col-span-2"><label className="text-xs text-mute">Notas<Input value={address.notes || ''} onChange={event => setAddress(index, 'notes', event.target.value)} placeholder="Horario, piso, referencia" /></label><button type="button" className="self-end text-xs text-bad hover:underline" onClick={() => removeAddress(index)}>Quitar</button></div></div>)}
      </div>
    </details>
    {onBillingChange && (
      <details className="rounded-xl border border-ink-600 p-3">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-fono-light"><Icon name="tag" className="h-3.5 w-3.5" /> Factura a otro titular (opcional)</summary>
        <p className="mt-2 text-xs text-mute">Cuando el cliente pide factura a nombre de otra persona o empresa: esposo/a, padre, empresa con RUC, etc.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-mute">Nombre y apellido del titular<Input aria-label="Nombre del titular de factura" value={billingTo?.name || ''} onChange={event => { setBillingLookup(null); setBillingRucError(''); onBillingChange({ ...billingTo, name: event.target.value }) }} placeholder="Nombre y apellido" /></label>
          <label className="text-xs text-mute">RUC del titular<Input aria-label="RUC del titular de factura" value={billingTo?.document || ''} onChange={event => { setBillingLookup(null); setBillingRucError(''); onBillingChange({ ...billingTo, document: event.target.value }) }} placeholder="80012345-6" /></label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2"><Button type="button" variant="outline" disabled={!billingTo?.document?.trim() || billingRucLoading} onClick={consultBillingRuc}>{billingRucLoading ? 'Consultando…' : 'Consultar RUC del titular'}</Button></div>
        {billingRucError && <p role="alert" className="mt-2 text-xs text-bad">{billingRucError}</p>}
        {billingLookup?.result && <div className="mt-3 rounded-lg border border-fono/25 bg-fono/5 p-3 text-sm"><p><strong>{billingLookup.result.name}</strong></p><p className="mt-1 text-xs text-mute">RUC {billingLookup.result.fullRuc}</p><div className="mt-3"><Button type="button" variant="outline" onClick={applyBillingRuc}>Aplicar nombre y RUC</Button></div></div>}
      </details>
    )}
  </div>
}
