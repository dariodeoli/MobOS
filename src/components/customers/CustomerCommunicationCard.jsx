import { useMemo, useState } from 'react'
import { Button, Select } from '@/components/ui'
import { renderMessage, whatsappUrl } from './customerMessaging'

export default function CustomerCommunicationCard({ customer, templates, onViewProfile }) {
  const [templateId, setTemplateId] = useState(templates[0]?.id || '')
  const template = useMemo(() => templates.find((item) => item.id === templateId) || templates[0], [templateId, templates])
  const phones = customer.phones?.length ? customer.phones : customer.phone ? [customer.phone] : []
  const addresses = customer.addresses?.length ? customer.addresses : customer.address ? [{ id: 'legacy', label: 'Principal', address: customer.address }] : []
  const text = renderMessage(template, customer)

  return <li className="min-w-0 break-words rounded-2xl border border-fore/10 bg-fore/[.02] p-4">
    <h2 className="font-semibold">{customer.name}</h2>
    <div className="mt-3 space-y-2 text-sm text-mute">
      <div><span className="mr-2 text-xs font-semibold uppercase tracking-wide text-mute">Teléfonos</span>{phones.length ? <div className="mt-1 flex flex-wrap gap-2">{phones.map((phone) => <span key={phone} className="rounded-full border border-fore/10 px-2 py-1">{phone}</span>)}</div> : <span>Sin teléfono</span>}</div>
      <div><span className="mr-2 text-xs font-semibold uppercase tracking-wide text-mute">Direcciones</span>{addresses.length ? <ul className="mt-1 space-y-1">{addresses.map((address, index) => <li key={address.id || `${address.label}-${index}`}><span className="font-medium">{address.label || 'Dirección'}:</span> {address.address}{address.city ? ` · ${address.city}` : ''}</li>)}</ul> : <span>Sin dirección</span>}</div>
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <label className="sr-only" htmlFor={`template-${customer.id}`}>Plantilla de WhatsApp</label>
      <Select id={`template-${customer.id}`} className="h-9 py-0 text-sm" value={template?.id || ''} onChange={(event) => setTemplateId(event.target.value)} disabled={!templates.length || !phones.length}>
        {templates.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
      </Select>
      {onViewProfile && <Button type="button" variant="outline" onClick={() => onViewProfile(customer)}>Ver perfil</Button>}
      <a className={`rounded-xl px-3 py-2 text-center text-sm font-semibold ${phones.length && template ? 'bg-fono text-onbrand' : 'cursor-not-allowed bg-fore/10 text-mute'}`} href={phones.length && template ? whatsappUrl(phones[0], text, customer.countryCode) : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!phones.length || !template} onClick={(event) => { if (!phones.length || !template) event.preventDefault() }}>
        Abrir WhatsApp
      </a>
    </div>
    {template && <p className="mt-2 text-xs text-mute">{text}</p>}
  </li>
}
