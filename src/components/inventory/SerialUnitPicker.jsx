import { useCallback, useEffect, useRef, useState } from 'react'
import { resources } from '@/lib/api'
import { Badge, Button, Skeleton } from '@/components/ui'
import SerialTexto from '@/components/shared/SerialTexto'
import MedidorBateria from '@/components/shared/MedidorBateria'
import { serialEnmascarado } from '@/utils/serial'
import { serialNormalizado as normalize, unidadesElegibles } from '@/utils/inventario'

// #286: mensaje honesto y accionable para cada fallo (nunca el texto crudo del
// API sin salida): permiso/sucursal se explican y siempre queda el camino de
// «sobre pedido».
const mensajeDeCarga = (cause) => {
  const status = Number(cause?.status || 0)
  if (status === 401) return 'Tu sesión venció: volvé a entrar para elegir el equipo.'
  if (status === 403) return 'No podés ver el stock de esa sucursal. Revisá tu sucursal activa o pedile a administración que te asigne una. Mientras tanto, podés marcar la venta «sobre pedido» y asignar el IMEI al entregar.'
  const detalle = String(cause?.message || '').trim()
  return `${detalle || 'No se pudieron cargar los IMEI de este modelo.'} Probá de nuevo; si persiste, vendé «sobre pedido» y asigná el IMEI al entregar.`
}

// Selector para una línea de venta. La reserva se hace antes del checkout para
// evitar que dos vendedores elijan el mismo equipo; el backend mantiene la
// autoridad sobre disponibilidad y vencimiento.
export default function SerialUnitPicker({ product, branchId = '', customerName, selectedSerials = [], onChange, onRequiresSerial, disabled = false }) {
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(false)
  const [busySerial, setBusySerial] = useState('')
  const [error, setError] = useState('')
  const [sinSucursal, setSinSucursal] = useState(false)
  const seleccionadosRef = useRef(selectedSerials)
  useEffect(() => { seleccionadosRef.current = selectedSerials }, [selectedSerials])

  const load = useCallback(async () => {
    if (!product?.id) { setUnits([]); onRequiresSerial?.(false, 0); return }
    setLoading(true); setError(''); setSinSucursal(false)
    try {
      // #286: sin sucursal en la venta no se inventa stock ni se listan unidades
      // de otras sucursales: se explica que falta la sucursal (la venta tampoco
      // puede descontar stock así). Con sucursal, la API devuelve solo las de
      // esa sucursal (#263) y el selector no vuelve a filtrar por sucursal.
      if (!branchId) {
        setUnits([])
        setSinSucursal(true)
        onRequiresSerial?.(false, 0)
        return
      }
      const rows = await resources.inventoryUnits.list('', 'active', { productId: product.id, branchId })
      const matched = unidadesElegibles(rows, { productId: product.id, seleccionados: seleccionadosRef.current })
      setUnits(matched)
      // Segundo argumento: cuántas unidades hay (guía inline del POS).
      onRequiresSerial?.(matched.length > 0, matched.length)
    } catch (cause) { setError(mensajeDeCarga(cause)) } finally { setLoading(false) }
  }, [product, branchId, onRequiresSerial])

  // El efecto inicial carga solo cuando cambia el producto o la sucursal; el ref
  // mantiene la versión más reciente de load sin volver a disparar la descarga.
  const loadRef = useRef(load)
  useEffect(() => { loadRef.current = load }, [load])
  useEffect(() => { loadRef.current() }, [product?.id, branchId])

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
  // #286: sin sucursal no hay stock que ofrecer; se dice por qué y cómo seguir.
  if (sinSucursal) return <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-warn/40 bg-warn/5 px-3 py-2 text-xs text-warn" role="status" data-testid="picker-sin-sucursal">
    <span className="min-w-0 flex-1">Tu usuario no tiene sucursal asignada: pedile a administración que te asigne una para elegir el equipo físico. Mientras tanto, podés vender «sobre pedido» y asignar el IMEI al entregar.</span>
    <Button type="button" variant="ghost" className="h-8 shrink-0 px-2 text-[11px] text-warn" onClick={() => load()}>Reintentar</Button>
  </div>
  if (!units.length && !error) return <p className="mt-3 rounded-xl border border-ink-600 bg-ink-800/40 px-3 py-2 text-xs text-mute">No hay unidades disponibles de este modelo en tu sucursal. Si el cliente la espera, marcala como «sobre pedido»: el IMEI se asigna al entregar.</p>

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
    {error && <p role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-xs text-bad" data-testid="picker-error"><span className="min-w-0 flex-1">{error}</span><Button type="button" variant="ghost" className="h-8 shrink-0 px-2 text-[11px] text-bad" onClick={() => load()}>Reintentar</Button></p>}
  </section>
}
