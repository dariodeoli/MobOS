import { useCallback, useEffect, useRef, useState } from 'react'
import { resources } from '@/lib/api'
import { Badge, Button, Skeleton } from '@/components/ui'
import SerialTexto from '@/components/shared/SerialTexto'
import MedidorBateria from '@/components/shared/MedidorBateria'
import { serialEnmascarado } from '@/utils/serial'

const normalize = (value = '') => String(value).trim().replace(/^MOBOS:/i, '').replace(/[\s-]+/g, '').toUpperCase()

// Selector para una línea de venta. La reserva se hace antes del checkout para
// evitar que dos vendedores elijan el mismo equipo; el backend mantiene la
// autoridad sobre disponibilidad y vencimiento.
export default function SerialUnitPicker({ product, customerName, selectedSerials = [], onChange, onRequiresSerial, disabled = false }) {
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(false)
  const [busySerial, setBusySerial] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!product?.id) { setUnits([]); onRequiresSerial?.(false); return }
    setLoading(true); setError('')
    try {
      const query = product.sku || product.nombre || product.name || ''
      // `resources` respeta la demo (#213): en la demo las unidades salen del
      // store ficticio, no del API. Se filtra por producto y sucursal, como la
      // API real.
      const rows = await resources.inventoryUnits.list(query)
      const matched = (rows || []).filter(unit => unit.productId === product.id
        && (!product.branchId || !unit.branchId || unit.branchId === product.branchId))
      setUnits(matched)
      onRequiresSerial?.(matched.length > 0)
    } catch (cause) { setError(cause?.message || 'No se pudieron cargar los IMEI de este modelo.') } finally { setLoading(false) }
  }, [product, onRequiresSerial])

  // El efecto inicial carga solo cuando cambia el producto; el ref mantiene
  // la versión más reciente de load sin volver a disparar la descarga.
  const loadRef = useRef(load)
  useEffect(() => { loadRef.current = load }, [load])
  useEffect(() => { loadRef.current() }, [product?.id])

  async function toggle(unit) {
    const serial = normalize(unit.serial)
    if (!serial || disabled || busySerial) return
    setBusySerial(serial); setError('')
    try {
      if (selectedSerials.includes(serial)) {
        await resources.inventoryReservations.release([serial])
        onChange(selectedSerials.filter(value => value !== serial))
      } else {
        if (!customerName?.trim()) throw new Error('Indicá primero el cliente para reservar este equipo.')
        if (unit.status !== 'AVAILABLE') throw new Error('Ese equipo ya no está disponible.')
        // `minutes` manda en el API real; `hours` lo usa el store de la demo.
        await resources.inventoryReservations.create({ customerName: customerName.trim(), minutes: 60, hours: 1, serials: [serial] })
        // Una línea representa una unidad; para vender otra, agregala como nueva línea.
        onChange([serial])
      }
      await load()
    } catch (cause) { setError(cause?.message || 'No se pudo actualizar la reserva.') } finally { setBusySerial('') }
  }

  if (!product?.id) return null
  if (loading) return <div className="mt-3 space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
  if (!units.length && !error) return null

  return <section className="mt-3 rounded-2xl border border-fono/25 bg-fono/[.04] p-3" aria-label="Unidad física para esta venta">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><p className="text-sm font-semibold">Equipo físico / IMEI</p><p className="mt-0.5 text-xs text-mute">Elegí y reservá la unidad exacta. La reserva dura 60 minutos.</p></div>
      <Badge color={selectedSerials.length ? 'green' : 'orange'}>{selectedSerials.length ? `IMEI ${serialEnmascarado(selectedSerials[0])}` : 'Requerido'}</Badge>
    </div>
    <div className="mt-3 space-y-1.5">{units.map(unit => {
      const selected = selectedSerials.includes(normalize(unit.serial))
      const available = unit.status === 'AVAILABLE' || selected
      return <div key={unit.id} className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 transition ${selected ? 'border-ok/40 bg-ok/10' : 'border-ink-600 hover:border-fono/30'}`}>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-1 text-[12px]"><span className="shrink-0">IMEI</span><SerialTexto serial={unit.serial} className="truncate text-mute" tonoCola="font-bold text-fono-light" /></span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-mute">
            <Badge color={unit.condition === 'USED' ? 'orange' : 'green'}>{unit.condition === 'USED' ? 'Seminuevo' : 'Nuevo'}</Badge>
            {unit.batteryHealth ? <MedidorBateria porcentaje={unit.batteryHealth} variante="chip" /> : null}
            {unit.location?.name ? <span>· {unit.location.name}</span> : null}
            {!available && !selected ? <span className="font-semibold text-bad">No disponible</span> : null}
          </span>
        </span>
        <Button type="button" variant={selected ? 'outline' : 'primary'} className="h-8 shrink-0 px-2.5 text-xs" disabled={!available || disabled || Boolean(busySerial)} onClick={() => toggle(unit)}>
          {busySerial === normalize(unit.serial) ? 'Actualizando…' : selected ? 'Liberar' : available ? 'Reservar este' : 'No disponible'}
        </Button>
      </div>
    })}</div>
    {error && <p role="alert" className="mt-2 text-xs text-bad">{error}</p>}
  </section>
}
