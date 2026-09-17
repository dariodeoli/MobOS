import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api/client'
import { formatGs } from '@/utils/moneda'
import Icon from '@/components/shared/Icon'
import { Button } from '@/components/ui'

// Descuento fuera de política: el vendedor pide autorización desde el carrito,
// gerencia la resuelve en su panel y acá se refleja el estado. Si hay una
// aprobada vigente (sin usar y que alcanza para el monto actual) se entrega al
// POS para que la venta viaje con discountAuthorizationId.
export default function AutorizacionDescuento({ monto, customerId, onSelect, bloqueado }) {
  const [rows, setRows] = useState([])
  const [cargando, setCargando] = useState(false)
  const [solicitando, setSolicitando] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const data = await api.get('/api/authorizations?mine=1&kind=DISCOUNT')
      setRows(Array.isArray(data) ? data : [])
    } catch (cause) {
      setError(cause?.message || 'No se pudo consultar la autorización.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const pendiente = rows.find(row => row.status === 'PENDING') || null
  const aprobada = rows.find(row => row.status === 'APPROVED' && !row.usedAt) || null
  const rechazada = !pendiente && !aprobada ? rows.find(row => row.status === 'REJECTED') || null : null
  const maxAprobado = aprobada ? Number(aprobada.resolvedValue?.maxDiscountPyg ?? 0) : 0
  const alcanza = Boolean(aprobada) && monto > 0 && monto <= maxAprobado

  // El callback viaja por ref para no re-disparar el efecto en cada render.
  const onSelectRef = useRef(onSelect)
  useEffect(() => { onSelectRef.current = onSelect })
  useEffect(() => {
    onSelectRef.current?.(alcanza ? { id: aprobada.id, maxDiscountPyg: maxAprobado } : null)
  }, [alcanza, aprobada?.id, maxAprobado])

  async function solicitar() {
    if (solicitando || monto <= 0) return
    setSolicitando(true)
    setError('')
    try {
      await api.post('/api/authorizations', {
        kind: 'DISCOUNT',
        ...(customerId ? { customerId } : {}),
        requestedValue: { discountPyg: monto },
      })
      await cargar()
    } catch (cause) {
      setError(cause?.message || 'No se pudo solicitar la autorización.')
    } finally {
      setSolicitando(false)
    }
  }

  return (
    <div className="rounded-xl border border-warn/30 bg-warn/5 p-3 md:col-span-2">
      <div className="flex flex-wrap items-center gap-2">
        <Icon name="lock" className="h-4 w-4 text-warn" />
        <p className="text-xs font-semibold">Descuento fuera de política</p>
        {pendiente && <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[11px] font-semibold text-warn">Pendiente</span>}
        {aprobada && alcanza && <span className="rounded-full border border-ok/40 bg-ok/10 px-2 py-0.5 text-[11px] font-semibold text-ok">Autorizado hasta {formatGs(maxAprobado)}</span>}
        {aprobada && !alcanza && (
          <span className="rounded-full border border-bad/40 bg-bad/10 px-2 py-0.5 text-[11px] font-semibold text-bad">Autorizado hasta {formatGs(maxAprobado)} · no alcanza</span>
        )}
        {rechazada && <span className="rounded-full border border-bad/40 bg-bad/10 px-2 py-0.5 text-[11px] font-semibold text-bad">Rechazado</span>}
        {!pendiente && !aprobada && !rechazada && <span className="text-[11px] text-mute">Sin autorización vigente</span>}
      </div>
      <p className="mt-1 text-xs text-mute">
        {alcanza
          ? 'La autorización queda asociada a esta venta: no se puede reutilizar.'
          : pendiente
            ? 'Gerencia tiene que resolver la solicitud. Podés seguir armando la venta mientras tanto.'
            : 'Solicitá autorización con el monto actual y actualizá el estado cuando gerencia responda.'}
      </p>
      {rechazada?.resolvedNote && <p className="mt-1 text-xs text-bad">Motivo: {rechazada.resolvedNote}</p>}
      {error && <p role="alert" className="mt-2 rounded-lg border border-bad/30 bg-bad/10 px-2.5 py-2 text-xs text-bad">{error}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" onClick={solicitar} disabled={solicitando || bloqueado || monto <= 0 || Boolean(pendiente) || alcanza}>
          <Icon name="send" className="h-4 w-4" />
          {solicitando ? 'Solicitando…' : 'Solicitar autorización'}
        </Button>
        <Button type="button" variant="ghost" onClick={cargar} disabled={cargando}>
          <Icon name="refresh" className="h-4 w-4" />
          {cargando ? 'Consultando…' : 'Actualizar estado'}
        </Button>
      </div>
    </div>
  )
}
