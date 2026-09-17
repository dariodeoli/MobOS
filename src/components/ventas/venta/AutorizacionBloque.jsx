import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api/client'
import { formatGs } from '@/utils/moneda'
import Icon from '@/components/shared/Icon'
import { Button } from '@/components/ui'

// Bloque genérico de autorización de un solo uso. El vendedor pide, gerencia
// resuelve en su panel y acá se refleja el estado; si hay una aprobada vigente
// (sin usar y que alcanza para lo pedido) se entrega al flujo que la consume.
// Sirve para descuentos, ventas bajo lista, ajustes de stock y anulaciones:
// `requestedValue` es el pedido y `monto` el importe que el máximo debe cubrir.
export default function AutorizacionBloque({
  kind,
  titulo,
  descripcion,
  requestedValue,
  customerId,
  entity,
  entityId,
  monto = 0,
  sinMonto = false,
  soloEstado = false,
  nota,
  onSelect,
  bloqueado,
}) {
  const [rows, setRows] = useState([])
  const [cargando, setCargando] = useState(false)
  const [solicitando, setSolicitando] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const data = await api.get(`/api/authorizations?mine=1&kind=${kind}`)
      setRows(Array.isArray(data) ? data : [])
    } catch (cause) {
      setError(cause?.message || 'No se pudo consultar la autorización.')
    } finally {
      setCargando(false)
    }
  }, [kind])

  useEffect(() => { cargar() }, [cargar])

  // Con sujeto (unidad, pedido, producto) solo valen las filas de ESE sujeto.
  const esDelSujeto = (row) => !entity || (row.entity === entity && row.entityId === entityId)
  const pendiente = rows.find(row => row.status === 'PENDING' && esDelSujeto(row)) || null
  const aprobada = rows.find(row => row.status === 'APPROVED' && !row.usedAt && esDelSujeto(row)) || null
  const rechazada = !pendiente && !aprobada ? rows.find(row => row.status === 'REJECTED' && esDelSujeto(row)) || null : null
  const maxAprobado = aprobada ? Number(aprobada.resolvedValue?.maxDiscountPyg ?? 0) : 0
  const alcanza = Boolean(aprobada) && (sinMonto || (monto > 0 && monto <= maxAprobado))

  // El callback viaja por ref para no re-disparar el efecto en cada render.
  const onSelectRef = useRef(onSelect)
  useEffect(() => { onSelectRef.current = onSelect })
  useEffect(() => {
    onSelectRef.current?.(alcanza ? { id: aprobada.id, maxDiscountPyg: maxAprobado } : null)
  }, [alcanza, aprobada?.id, maxAprobado])

  async function solicitar() {
    if (solicitando || (!sinMonto && monto <= 0)) return
    setSolicitando(true)
    setError('')
    try {
      await api.post('/api/authorizations', {
        kind,
        ...(customerId ? { customerId } : {}),
        requestedValue,
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
        <p className="text-xs font-semibold">{titulo}</p>
        {pendiente && <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[11px] font-semibold text-warn">Pendiente</span>}
        {aprobada && alcanza && <span className="rounded-full border border-ok/40 bg-ok/10 px-2 py-0.5 text-[11px] font-semibold text-ok">{sinMonto ? 'Autorizada' : `Autorizado hasta ${formatGs(maxAprobado)}`}</span>}
        {aprobada && !alcanza && (
          <span className="rounded-full border border-bad/40 bg-bad/10 px-2 py-0.5 text-[11px] font-semibold text-bad">Autorizado hasta {formatGs(maxAprobado)} · no alcanza</span>
        )}
        {rechazada && <span className="rounded-full border border-bad/40 bg-bad/10 px-2 py-0.5 text-[11px] font-semibold text-bad">Rechazada</span>}
        {!pendiente && !aprobada && !rechazada && <span className="text-[11px] text-mute">Sin autorización vigente</span>}
      </div>
      <p className="mt-1 text-xs text-mute">
        {alcanza
          ? 'La autorización queda asociada a esta operación: no se puede reutilizar.'
          : pendiente
            ? 'Gerencia tiene que resolver la solicitud. Podés seguir avanzando mientras tanto.'
            : descripcion || 'Solicitá autorización a gerencia y actualizá el estado cuando responda.'}
      </p>
      {nota && <p className="mt-1 text-xs text-mute">{nota}</p>}
      {rechazada?.resolvedNote && <p className="mt-1 text-xs text-bad">Motivo: {rechazada.resolvedNote}</p>}
      {error && <p role="alert" className="mt-2 rounded-lg border border-bad/30 bg-bad/10 px-2.5 py-2 text-xs text-bad">{error}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {!soloEstado && (
          <Button type="button" onClick={solicitar} disabled={solicitando || bloqueado || (!sinMonto && monto <= 0) || Boolean(pendiente) || alcanza}>
            <Icon name="send" className="h-4 w-4" />
            {solicitando ? 'Solicitando…' : 'Solicitar autorización'}
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={cargar} disabled={cargando}>
          <Icon name="refresh" className="h-4 w-4" />
          {cargando ? 'Consultando…' : 'Actualizar estado'}
        </Button>
      </div>
    </div>
  )
}
