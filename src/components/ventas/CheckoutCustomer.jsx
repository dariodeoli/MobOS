import { useEffect, useState } from 'react'
import { api } from '@/lib/api/client'
import { Button, Input } from '@/components/ui'
import CityAutocomplete from '@/components/shared/CityAutocomplete'
import EmailField from '@/components/shared/EmailField'
import RucField from '@/components/shared/RucField'
import PhoneField from '@/components/shared/PhoneField'
import Icon from '@/components/shared/Icon'
import { coincideCliente, datosFacturacionCliente } from '@/utils/cliente'
import { capitalizarPrimera } from '@/utils/texto'

const emptyAddress = () => ({ label: 'Principal', address: '', city: '', department: '', country: 'Paraguay', notes: '', isDefault: true })
const clienteVacio = () => ({ id: undefined, name: '', phone: '', countryCode: '+595', email: '', document: '', pricingTier: 'RETAIL', creditLimitPyg: null, creditDays: null, addresses: [], billingName: '', billingDocument: '' })
const customerValue = (customer) => ({
  id: customer.id, name: customer.name || '', phone: customer.phone || '', countryCode: customer.countryCode || '+595',
  email: customer.email || '', document: customer.document || '',
  pricingTier: customer.pricingTier || 'RETAIL', creditLimitPyg: customer.creditLimitPyg ?? null, creditDays: customer.creditDays ?? null,
  addresses: Array.isArray(customer.addresses) ? customer.addresses.map(({ id, ...address }) => address) : [],
  billingName: customer.billingName || '', billingDocument: customer.billingDocument || '',
})

export default function CheckoutCustomer({ value, onChange, esDemo, billingTo, onBillingChange }) {
  const [matches, setMatches] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const query = (value.name || '').trim()
    if (!query) { setMatches([]); return () => { active = false } }
    const timer = setTimeout(async () => {
      try {
        const rows = esDemo ? JSON.parse(localStorage.getItem('mobos:demo-customers:v1') || '[]') : await api.get(`/api/customers?q=${encodeURIComponent(query)}`)
        if (active) { setMatches(rows.filter(customer => coincideCliente(customer, query)).slice(0, 5)); setError('') }
      } catch { if (active) setError('No se pudo consultar clientes. Reintentá antes de confirmar.') }
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [value.name, esDemo])

  function elegirCliente(customer) {
    onChange(customerValue(customer))
    // La factura a otro titular que el cliente ya usó se propone de nuevo,
    // salvo que esta venta ya tenga datos escritos.
    const facturacion = datosFacturacionCliente(customer)
    if (facturacion && onBillingChange && !billingTo?.name?.trim() && !billingTo?.document?.trim()) onBillingChange(facturacion)
  }
  function quitarCliente() {
    setMatches([]); setError('')
    onChange(clienteVacio())
  }

  const setAddress = (index, field, next) => onChange({ ...value, addresses: value.addresses.map((address, position) => position === index ? { ...address, [field]: next } : address) })
  const addAddress = () => onChange({ ...value, addresses: [...(value.addresses || []), { ...emptyAddress(), label: `Dirección ${(value.addresses?.length || 0) + 1}`, isDefault: !value.addresses?.length }] })
  const removeAddress = (index) => onChange({ ...value, addresses: value.addresses.filter((_, position) => position !== index).map((address, position) => ({ ...address, isDefault: position === 0 ? true : address.isDefault })) })

  return <div className="space-y-3 md:col-span-2">
    <label className="block text-sm font-semibold">Cliente<Input aria-label="Nombre, teléfono, CI o RUC del cliente" value={value.name} placeholder="Buscar cliente o escribir un nombre nuevo" onChange={event => onChange({ ...value, id: undefined, name: event.target.value })} /></label>
    {!value.id && value.name && <div className="space-y-1">{matches.map(customer => <button type="button" key={customer.id} className="block w-full rounded-xl border border-ink-600 p-3 text-left text-sm hover:border-fono" onClick={() => elegirCliente(customer)}><strong>{customer.name}</strong><span className="ml-3 text-mute">{customer.phone || customer.document || customer.email || 'Sin identificador'}</span>{customer.addresses?.length ? <span className="ml-2 text-xs text-fono-light">· {customer.addresses.length} dirección{customer.addresses.length === 1 ? '' : 'es'}</span> : null}{datosFacturacionCliente(customer) ? <span className="ml-2 text-xs text-mute">· Factura a {customer.billingName || customer.billingDocument}</span> : null}</button>)}{!matches.length && !error && <p className="text-xs text-fono-light">Cliente nuevo: se creará automáticamente al confirmar la venta.</p>}</div>}
    {value.id && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-ok/30 bg-ok/10 px-3 py-2 text-xs"><span className="inline-flex items-center gap-1.5 font-bold text-ok"><Icon name="check" className="h-3.5 w-3.5" /> Cliente seleccionado</span><span className="font-semibold text-fore">{value.name}</span>{value.document ? <span className="text-mute">{value.document}</span> : null}{value.phone ? <span className="text-mute">{value.countryCode} {value.phone}</span> : null}{value.pricingTier === 'WHOLESALE' ? <span className="rounded border border-fono/30 px-1.5 py-0.5 font-bold text-fono-light">Mayorista</span> : null}{Number(value.creditLimitPyg || 0) > 0 ? <span className="rounded border border-warn/30 px-1.5 py-0.5 font-bold text-warn">Crédito hasta Gs. {Number(value.creditLimitPyg).toLocaleString('es-PY')}{value.creditDays ? ' · ' + value.creditDays + ' días' : ''}</span> : null}<button type="button" className="ml-auto rounded-lg border border-bad/40 px-2 py-1 font-semibold text-bad transition hover:bg-bad/10" onClick={quitarCliente}>× Quitar cliente</button></div>}
    {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    <details className="rounded-xl border border-ink-600 p-3"><summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-fono-light"><Icon name="user" className="h-3.5 w-3.5" /> Datos de contacto, RUC/CI y direcciones</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="text-xs text-mute">Teléfono<PhoneField countryCode={value.countryCode || '+595'} phone={value.phone || ''} onCountryCodeChange={countryCode => onChange({ ...value, countryCode })} onChange={phone => onChange({ ...value, phone })} countryAriaLabel="Código de país" phoneAriaLabel="Teléfono del cliente" /></div>
        <div className="text-xs text-mute">CI o RUC<RucField ariaLabel="CI o RUC del cliente" disabled={false} value={value.document || ''} onChange={(document) => onChange({ ...value, document })} onAplicar={(datos) => onChange({ ...value, name: datos.name || value.name, document: datos.fullRuc || value.document })} mostrarExtractor={!esDemo} /></div>
        <label className="text-xs text-mute">Correo<EmailField aria-label="Correo del cliente" value={value.email || ''} onChange={(email) => onChange({ ...value, email })} placeholder="cliente@correo.com" /></label>
      </div>
      <div className="mt-4 space-y-3"><div className="flex items-center justify-between"><strong className="text-sm">Direcciones</strong><Button type="button" variant="outline" onClick={addAddress}>+ Dirección</Button></div>        {!value.addresses?.length && <p className="text-xs text-mute">Sin dirección cargada. Podés continuar con retiro en tienda.</p>}
        {(value.addresses || []).map((address, index) => <div key={index} className="grid gap-2 rounded-xl border border-ink-600 p-3 sm:grid-cols-2"><div className="flex gap-2"><label className="text-xs text-mute">Etiqueta<Input autoCapitalize="words" value={address.label || ''} onChange={event => setAddress(index, 'label', capitalizarPrimera(event.target.value))} placeholder="Casa, trabajo…" /></label><label className="text-xs text-mute">País<Input maxLength={100} autoCapitalize="words" value={address.country ?? 'Paraguay'} onChange={event => setAddress(index, 'country', capitalizarPrimera(event.target.value))} placeholder="Paraguay" /></label></div><label className="text-xs text-mute">Ciudad<CityAutocomplete esDemo={esDemo} value={address.city || ''} onSelect={(city, department) => onChange({ ...value, addresses: value.addresses.map((item, position) => position === index ? { ...item, city, department } : item) })} placeholder="Asunción" />{address.department && <span className="block truncate px-1 pt-1 text-[11px] text-fono-light">{address.department}</span>}</label><label className="text-xs text-mute sm:col-span-2">Dirección<Input autoCapitalize="sentences" value={address.address || ''} onChange={event => setAddress(index, 'address', capitalizarPrimera(event.target.value))} placeholder="Calle, número y referencia" /></label><div className="flex items-center justify-between gap-2 sm:col-span-2"><label className="text-xs text-mute">Notas<Input autoCapitalize="sentences" value={address.notes || ''} onChange={event => setAddress(index, 'notes', capitalizarPrimera(event.target.value))} placeholder="Horario, piso, referencia" /></label><button type="button" className="self-end text-xs text-bad hover:underline" onClick={() => removeAddress(index)}>Quitar</button></div></div>)}
      </div>
    </details>
    {onBillingChange && (
      <details className="rounded-xl border border-ink-600 p-3">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-fono-light"><Icon name="tag" className="h-3.5 w-3.5" /> Factura a otro titular (opcional)</summary>
        <p className="mt-2 text-xs text-mute">Cuando el cliente pide factura a nombre de otra persona o empresa: esposo/a, padre, empresa con RUC, etc.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-mute">Nombre y apellido del titular<Input aria-label="Nombre del titular de factura" value={billingTo?.name || ''} onChange={event => onBillingChange({ ...billingTo, name: event.target.value })} placeholder="Nombre y apellido" /></label>
          <div className="text-xs text-mute">RUC del titular<RucField ariaLabel="RUC del titular de factura" value={billingTo?.document || ''} onChange={(document) => onBillingChange({ ...billingTo, document })} onAplicar={(datos) => onBillingChange({ ...billingTo, name: datos.name || billingTo?.name, document: datos.fullRuc || billingTo?.document })} mostrarExtractor={!esDemo} /></div>
        </div>
      </details>
    )}
  </div>
}
