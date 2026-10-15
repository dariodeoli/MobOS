import { useState } from 'react'
import { Aviso, Button, Input, Label, PinInput } from '@/components/ui'
import { api } from '@/lib/api/client'
import { resolverCreditoDemo } from '@/lib/demoCreditoStore'
import { gs } from '@/utils/calculos'
import { fechaHoraCorta } from '@/utils/fecha'

// Estado de la autorización de crédito en la página del pedido. Un pedido que
// superó el crédito del cliente no se entrega hasta que un administrador o
// gerente lo autorice: lo hace con su sesión (un clic) o, desde el mostrador,
// cualquier vendedor ingresando el PIN de uno de ellos. Rechazar pide motivo y
// deja el pedido sin entregar. Todo queda auditado en el servidor.
export default function CreditoPedido({ order, credito, esDemo, puedeResolver, sesion, onCambio }) {
  const [pin, setPin] = useState('')
  const [motivo, setMotivo] = useState('')
  const [rechazando, setRechazando] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!credito) return null

  async function resolver(accion) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      let siguiente
      if (esDemo) {
        siguiente = resolverCreditoDemo({ orderNumber: order.orderNumber || order.number, accion, pin, nota: motivo, sesion })
      } else {
        const respuesta = await api.post(`/api/orders/${encodeURIComponent(order.id)}/credit-authorization`, { action: accion, ...(pin ? { pin } : {}), ...(motivo.trim() ? { note: motivo.trim() } : {}) })
        siguiente = respuesta?.creditAuthorization || null
      }
      setPin('')
      setMotivo('')
      setRechazando(false)
      onCambio?.(siguiente)
    } catch (cause) {
      setError(cause?.message || 'No se pudo resolver la autorización de crédito.')
    } finally {
      setBusy(false)
    }
  }

  async function pedirDeNuevo() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      if (esDemo) throw new Error('En la demo la solicitud se hace al vender.')
      const respuesta = await api.post(`/api/orders/${encodeURIComponent(order.id)}/credit-authorization`, { action: 'request' })
      onCambio?.(respuesta?.creditAuthorization || null)
    } catch (cause) {
      setError(cause?.message || 'No se pudo pedir la autorización.')
    } finally {
      setBusy(false)
    }
  }

  if (credito.status === 'APPROVED') {
    return (
      <Aviso tono="ok" como="div" data-testid="credito-autorizado" className="rounded-xl px-3 py-2 text-xs">
        <b>Crédito autorizado</b>
        {credito.resolvedByName ? ` por ${credito.resolvedByName}` : ''}
        {credito.resolvedAt ? ` · ${fechaHoraCorta(credito.resolvedAt)}` : ''}
        {credito.overPyg > 0 ? ` · ${gs(credito.overPyg)} sobre el límite` : ''}
      </Aviso>
    )
  }

  if (credito.status === 'REJECTED') {
    return (
      <Aviso tono="error" como="div" role="alert" data-testid="credito-rechazado" className="space-y-2 rounded-xl p-3 text-sm">
        <p className="font-bold">Rechazado — anulá o pedí nueva autorización</p>
        <p className="text-xs">Crédito rechazado{credito.resolvedByName ? ` por ${credito.resolvedByName}` : ''}; este pedido ya no cuenta como deuda del cliente.</p>
        <p className="text-xs">{credito.resolvedNote || 'Sin motivo indicado.'} El pedido no se puede entregar. Podés pedir una nueva autorización o anular el pedido.</p>
        {!esDemo && <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={pedirDeNuevo}>Pedir autorización de nuevo</Button>}
        {error && <p role="alert" className="text-xs font-semibold">{error}</p>}
      </Aviso>
    )
  }

  return (
    <Aviso tono="warn" como="div" role="alert" data-testid="credito-pendiente" className="space-y-3 rounded-xl p-3 text-sm">
      <div>
        <p className="font-bold">Pendiente de autorización de crédito</p>
        <p className="mt-1 text-xs">
          El cliente superaría su crédito en <b data-testid="credito-exceso" className="tabular-nums">{gs(credito.overPyg)}</b>
          {credito.limitPyg > 0
            ? ` (límite ${gs(credito.limitPyg)}, deuda ${gs(credito.debtPyg)}, esta venta deja ${gs(credito.unpaidPyg)} sin cobrar)`
            : ' (no tiene crédito habilitado)'}
          . Las unidades quedan reservadas; no se puede entregar hasta que un administrador o gerente lo autorice.
          {credito.requestedByName ? ` Lo pidió ${credito.requestedByName}.` : ''}
        </p>
      </div>
      {puedeResolver && !rechazando && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" data-testid="credito-autorizar" className="min-h-11" disabled={busy} onClick={() => resolver('approve')}>
            {busy ? 'Guardando…' : 'Autorizar entrega'}
          </Button>
          <Button type="button" variant="outline" data-testid="credito-rechazar" className="min-h-11" disabled={busy} onClick={() => setRechazando(true)}>Rechazar…</Button>
        </div>
      )}
      {!puedeResolver && !rechazando && (
        <div className="space-y-1" data-testid="credito-pin">
          <Label htmlFor="pin-credito-pedido" className="mb-0 text-xs">Autorizar ahora con el PIN de un gerente o administrador</Label>
          <div className="flex flex-wrap items-center gap-2">
            <PinInput id="pin-credito-pedido" ariaLabel="PIN de gerente o administrador" length={6} value={pin} onChange={setPin} disabled={busy} />
            <Button type="button" data-testid="credito-autorizar-pin" className="min-h-11" disabled={busy || pin.length < 4} onClick={() => resolver('approve')}>Autorizar con PIN</Button>
          </div>
        </div>
      )}
      {rechazando && (
        <div className="space-y-2">
          <Label htmlFor="motivo-credito" className="mb-0 text-xs">Motivo del rechazo</Label>
          <Input id="motivo-credito" data-testid="credito-motivo" value={motivo} maxLength={500} onChange={(event) => setMotivo(event.target.value)} placeholder="Ej. tiene facturas vencidas" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="danger" data-testid="credito-rechazar-confirmar" className="min-h-11" disabled={busy || motivo.trim().length < 3} onClick={() => resolver('reject')}>Confirmar rechazo</Button>
            <Button type="button" variant="ghost" className="min-h-11" disabled={busy} onClick={() => { setRechazando(false); setMotivo('') }}>Cancelar</Button>
          </div>
        </div>
      )}
      {error && <p role="alert" data-testid="credito-error" className="text-xs font-semibold">{error}</p>}
    </Aviso>
  )
}
