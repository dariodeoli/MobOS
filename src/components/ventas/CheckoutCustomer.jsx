import { useEffect, useState } from 'react'
import { api } from '@/lib/api/client'
import { Input } from '@/components/ui'

export default function CheckoutCustomer({ value, onChange, esDemo }) {
  const [matches, setMatches] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const timer = setTimeout(async () => {
      try {
        const rows = esDemo ? JSON.parse(localStorage.getItem('mobos:demo-customers:v1') || '[]') : await api.get(`/api/customers?q=${encodeURIComponent(value.name || '')}`)
        if (active) { setMatches(rows.filter(c => `${c.name} ${c.phone || ''}`.toLowerCase().includes((value.name || '').toLowerCase())).slice(0, 5)); setError('') }
      } catch { if (active) setError('No se pudo consultar clientes. Reintentá antes de confirmar.') }
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [value.name, esDemo])
  return <div className="space-y-3 md:col-span-2">
    <label className="block text-sm font-semibold">Cliente<Input aria-label="Nombre o teléfono del cliente" value={value.name} placeholder="Buscar cliente o escribir un nombre nuevo" onChange={e => onChange({ name: e.target.value, phone: '', address: '' })} /></label>
    {!value.id && value.name && <div className="space-y-1">{matches.map(c => <button type="button" key={c.id} className="block w-full rounded-xl border border-ink-600 p-3 text-left text-sm hover:border-fono" onClick={() => onChange({ ...c, address: c.address || (c.notes?.startsWith('Dirección: ') ? c.notes.slice(11) : '') })}>{c.name}<span className="ml-3 text-mute">{c.phone}</span></button>)}{!matches.length && !error && <p className="text-xs text-fono-light">Cliente nuevo: se creará al confirmar la venta.</p>}</div>}
    {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    <details><summary className="cursor-pointer text-sm text-fono-light">Teléfono y dirección opcionales</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs text-mute">Teléfono<Input aria-label="Teléfono del cliente" type="tel" value={value.phone || ''} readOnly={Boolean(value.id)} onChange={e => onChange({ ...value, phone: e.target.value })} /></label><label className="text-xs text-mute">Dirección<Input aria-label="Dirección del cliente" value={value.address || ''} readOnly={Boolean(value.id)} onChange={e => onChange({ ...value, address: e.target.value })} /></label></div></details>
  </div>
}
