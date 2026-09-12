import { useEffect, useState } from 'react'
import { api } from '@/lib/api/client'
import { Badge, Button } from '@/components/ui'

const normalize = (value = '') => String(value).trim().replace(/^MOBOS:/i, '').replace(/[\s-]+/g, '').toUpperCase()

// Selector para una línea de venta. La reserva se hace antes del checkout para
// evitar que dos vendedores elijan el mismo equipo; el backend mantiene la
// autoridad sobre disponibilidad y vencimiento.
export default function SerialUnitPicker({ product, customerName, selectedSerials = [], onChange, onRequiresSerial, disabled = false }) {
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(false)
  const [busySerial, setBusySerial] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    if (!product?.id) { setUnits([]); onRequiresSerial?.(false); return }
    setLoading(true); setError('')
    try {
      const query = product.sku || product.nombre || product.name || ''
      const rows = await api.get(`/api/inventory-units?q=${encodeURIComponent(query)}`)
      const matched = (rows || []).filter(unit => unit.productId === product.id)
      setUnits(matched)
      onRequiresSerial?.(matched.length > 0)
    } catch (cause) { setError(cause?.message || 'No se pudieron cargar los IMEI de este modelo.') } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [product?.id])

  async function toggle(unit) {
    const serial = normalize(unit.serial)
    if (!serial || disabled || busySerial) return
    setBusySerial(serial); setError('')
    try {
      if (selectedSerials.includes(serial)) {
        await api.patch('/api/inventory-reservations', { action: 'release', serials: [serial] })
        onChange(selectedSerials.filter(value => value !== serial))
      } else {
        if (!customerName?.trim()) throw new Error('Indicá primero el cliente para reservar este equipo.')
        if (unit.status !== 'AVAILABLE') throw new Error('Ese equipo ya no está disponible.')
        await api.post('/api/inventory-reservations', { customerName: customerName.trim(), minutes: 60, serials: [serial] })
        // Una línea representa una unidad; para vender otra, agregala como nueva línea.
        onChange([serial])
      }
      await load()
    } catch (cause) { setError(cause?.message || 'No se pudo actualizar la reserva.') } finally { setBusySerial('') }
  }

  if (!product?.id) return null
  if (loading) return <p className="mt-3 text-xs text-mute">Buscando unidades serializadas…</p>
  if (!units.length && !error) return null

  return <section className="mt-3 rounded-xl border border-fono/25 bg-fono/[.04] p-3" aria-label="Unidad física para esta venta">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold">Equipo físico / IMEI</p><p className="mt-0.5 text-xs text-mute">Elegí y reservá la unidad exacta. La reserva dura 60 minutos.</p></div><Badge color={selectedSerials.length ? 'green' : 'orange'}>{selectedSerials.length ? `IMEI ••••${selectedSerials[0].slice(-4)}` : 'Requerido'}</Badge></div>
    <div className="mt-3 space-y-2">{units.map(unit => {
      const selected = selectedSerials.includes(normalize(unit.serial))
      const available = unit.status === 'AVAILABLE' || selected
      return <div key={unit.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-2.5 ${selected ? 'border-ok/40 bg-ok/5' : 'border-ink-600'}`}><div><p className="text-sm font-medium">IMEI {unit.serial} <span className="ml-1 font-bold text-fono-light">••••{unit.serial?.slice(-4)}</span></p><p className="text-xs text-mute">{unit.condition === 'USED' ? 'Seminuevo' : 'Nuevo'}{unit.batteryHealth ? ` · Batería ${unit.batteryHealth}%` : ''}{unit.location?.name ? ` · ${unit.location.name}` : ''}</p></div><Button type="button" variant={selected ? 'outline' : 'primary'} disabled={!available || disabled || Boolean(busySerial)} onClick={() => toggle(unit)}>{busySerial === normalize(unit.serial) ? 'Actualizando…' : selected ? 'Liberar' : available ? 'Reservar este' : 'No disponible'}</Button></div>
    })}</div>
    {error && <p role="alert" className="mt-2 text-xs text-bad">{error}</p>}
  </section>
}
