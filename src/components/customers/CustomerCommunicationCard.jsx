import { useMemo, useState } from 'react'
import { Badge, IconAction, Select } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'
import { gs } from '@/utils/calculos'
import { renderMessage, whatsappUrl } from './customerMessaging'

export default function CustomerCommunicationCard({ customer, templates, onViewProfile }) {
  const [templateId, setTemplateId] = useState(templates[0]?.id || '')
  const template = useMemo(() => templates.find((item) => item.id === templateId) || templates[0], [templateId, templates])
  const phones = customer.phones?.length ? customer.phones : customer.phone ? [customer.phone] : []
  const addresses = customer.addresses?.length ? customer.addresses : customer.address ? [{ id: 'legacy', label: 'Principal', address: customer.address }] : []
  const text = renderMessage(template, customer)

  return <li className="min-w-0 break-words rounded-2xl border border-fore/10 bg-fore/[.02] p-3">
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="font-semibold">{customer.name}</h2>
      <Badge color={customer.wholesale || customer.pricingTier === 'WHOLESALE' ? 'blue' : 'slate'}>{customer.wholesale || customer.pricingTier === 'WHOLESALE' ? 'Mayorista' : 'Cliente final'}</Badge>
    </div>
    <p className="mt-0.5 font-mono text-[11px] text-mute">ID …{String(customer.id || '').slice(-6)}</p>
    {(customer.stats || customer.createdAt) && <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs"><span className="text-mute">Pedidos <b className="text-fore">{customer.stats?.orders ?? 0}</b></span><span className="text-mute">Total <b className="text-fore">{gs(customer.stats?.totalSpentPyg || 0)}</b></span><span className="text-mute">Último pedido <b className="text-fore">{customer.stats?.lastOrderAt ? new Date(customer.stats.lastOrderAt).toLocaleDateString('es-PY') : '—'}</b></span><span className="text-mute">Registrado <b className="text-fore">{customer.createdAt ? new Date(customer.createdAt).toLocaleDateString('es-PY') : '—'}</b></span></div>}
    <div className="mt-2.5 space-y-2 text-xs text-mute">
      <div><span className="mr-2 text-xs font-semibold uppercase tracking-wide text-mute">Teléfonos</span>{phones.length ? <div className="mt-1 flex flex-wrap gap-2">{phones.map((phone) => <span key={phone} className="rounded-full border border-fore/10 px-2 py-1">{phone}</span>)}</div> : <span>Sin teléfono</span>}</div>
      <div><span className="mr-2 text-xs font-semibold uppercase tracking-wide text-mute">Direcciones</span>{addresses.length ? <ul className="mt-1 space-y-1">{addresses.map((address, index) => <li key={address.id || `${address.label}-${index}`}><span className="font-medium">{address.label || 'Dirección'}:</span> {address.address}{address.city ? ` · ${address.city}` : ''}</li>)}</ul> : <span>Sin dirección</span>}</div>
    </div>
    <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <label className="sr-only" htmlFor={`template-${customer.id}`}>Plantilla de WhatsApp</label>
      <Select id={`template-${customer.id}`} className="h-9 py-0 text-sm" value={template?.id || ''} onChange={(event) => setTemplateId(event.target.value)} disabled={!templates.length || !phones.length}>
        {templates.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
      </Select>
      {onViewProfile && <IconAction icon="eye" tone="fono" label="Ver perfil" onClick={() => onViewProfile(customer)} />}
      <a className={cn('grid h-7 w-7 place-items-center rounded-lg border transition active:scale-95', phones.length && template ? 'border-ok/30 text-ok hover:bg-ok/10' : 'cursor-not-allowed border-transparent text-mute opacity-40')} title="Abrir WhatsApp" aria-label="Abrir WhatsApp" href={phones.length && template ? whatsappUrl(phones[0], text, customer.countryCode) : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!phones.length || !template} onClick={(event) => { if (!phones.length || !template) event.preventDefault() }}>
        <Icon name="send" className="h-4 w-4" />
      </a>
    </div>
    {template && <p className="mt-2 text-xs text-mute">{text}</p>}
  </li>
}
