import { useMemo, useState } from 'react'
import { renderMessage, whatsappUrl } from './customerMessaging'

export default function CustomerCommunicationCard({ customer, templates }) {
  const [templateId, setTemplateId] = useState(templates[0]?.id || '')
  const template = useMemo(() => templates.find((item) => item.id === templateId) || templates[0], [templateId, templates])
  const phones = customer.phones?.length ? customer.phones : customer.phone ? [customer.phone] : []
  const addresses = customer.addresses?.length ? customer.addresses : customer.address ? [{ id: 'legacy', label: 'Principal', address: customer.address }] : []
  const text = renderMessage(template, customer)

  return <li className="min-w-0 break-words rounded-2xl border border-white/10 bg-white/[.02] p-4">
    <h2 className="font-semibold">{customer.name}</h2>
    <div className="mt-3 space-y-2 text-sm text-slate-300">
      <div><span className="mr-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Teléfonos</span>{phones.length ? <div className="mt-1 flex flex-wrap gap-2">{phones.map((phone) => <span key={phone} className="rounded-full border border-white/10 px-2 py-1">{phone}</span>)}</div> : <span>Sin teléfono</span>}</div>
      <div><span className="mr-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Direcciones</span>{addresses.length ? <ul className="mt-1 space-y-1">{addresses.map((address, index) => <li key={address.id || `${address.label}-${index}`}><span className="font-medium">{address.label || 'Dirección'}:</span> {address.address}{address.city ? ` · ${address.city}` : ''}</li>)}</ul> : <span>Sin dirección</span>}</div>
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
      <label className="sr-only" htmlFor={`template-${customer.id}`}>Plantilla de WhatsApp</label>
      <select id={`template-${customer.id}`} className="w-full rounded-xl border border-white/15 bg-[#071018] px-3 py-2 text-sm text-white focus:border-fono focus:outline-none" value={template?.id || ''} onChange={(event) => setTemplateId(event.target.value)} disabled={!templates.length || !phones.length}>
        {templates.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
      </select>
      <a className={`rounded-xl px-3 py-2 text-center text-sm font-semibold ${phones.length && template ? 'bg-fono text-white' : 'cursor-not-allowed bg-white/10 text-slate-500'}`} href={phones.length && template ? whatsappUrl(phones[0], text, customer.countryCode) : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!phones.length || !template} onClick={(event) => { if (!phones.length || !template) event.preventDefault() }}>
        Abrir WhatsApp
      </a>
    </div>
    {template && <p className="mt-2 text-xs text-slate-400">{text}</p>}
  </li>
}
