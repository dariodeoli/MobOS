import { useMemo, useRef, useState } from 'react'
import { Button, Modal, MoneyInput, Textarea } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import CuentaCobroCombobox from './CuentaCobroCombobox'
import { api } from '@/lib/api'
import { corregirPagoDemo } from '@/lib/demoCorreccionPago'
import { ETIQUETAS_MEDIO_PAGO } from '@/lib/constants'
import { gs } from '@/utils/calculos'
import { cuerpoCorreccion, errorCorreccion, MOTIVO_MAX, puedeDejarAlRepartidor, restanteCorreccion } from '@/utils/correccionPago'

// Corregir el medio de un pago ya cobrado (#393). El original nunca se edita:
// el servidor crea una reversión y los pagos nuevos que suman exactamente lo
// mismo. Acá se arma el reparto, se valida en vivo y se envía con una
// Idempotency-Key estable por apertura (cambia solo si cambia el cuerpo).
const nuevaClave = () => globalThis.crypto?.randomUUID?.() || `corr-${Date.now()}-${Math.random().toString(36).slice(2)}-xxxx`
let secuencia = 0
const filaNueva = (amount = '') => ({ key: `fila-${++secuencia}`, accountId: '', amount, toDriver: false })

export default function CorregirPagoModal({ pago, pedido, usuario, cuentas = [], esDemo = false, onClose, onCorregido }) {
  const original = useMemo(() => ({ ...pago, amountPyg: Number(pago.amountPyg ?? pago.monto ?? 0) }), [pago])
  const cuentasPyg = useMemo(() => cuentas.filter((cuenta) => cuenta.isActive !== false && cuenta.currency === 'PYG' && ['CASH', 'TRANSFER', 'CARD', 'PIX'].includes(cuenta.kind)), [cuentas])
  const [motivo, setMotivo] = useState('')
  const [filas, setFilas] = useState(() => [filaNueva(original.amountPyg)])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const intento = useRef(null)
  const repartidorPosible = puedeDejarAlRepartidor(usuario, pedido)

  const restante = restanteCorreccion(original, filas)
  const problema = errorCorreccion({ original, filas, motivo })
  const nombreOriginal = pago.accountSnapshot?.name || pago.cuenta || pago.medioPago
  const kindDe = (accountId) => cuentasPyg.find((cuenta) => cuenta.id === accountId)?.kind

  function cambiarFila(key, cambios) {
    setError('')
    setFilas((actuales) => actuales.map((fila) => {
      if (fila.key !== key) return fila
      const siguiente = { ...fila, ...cambios }
      // El efectivo al repartidor solo aplica a una cuenta de efectivo.
      if ('accountId' in cambios && kindDe(cambios.accountId) !== 'CASH') siguiente.toDriver = false
      return siguiente
    }))
  }

  async function enviar(event) {
    event.preventDefault()
    if (busy || problema) return
    setBusy(true); setError('')
    try {
      const cuerpo = cuerpoCorreccion({ motivo, filas })
      if (esDemo) {
        const cambios = corregirPagoDemo({ pedido, original: pago, motivo, filas, cuentas: cuentasPyg, repartidor: !!pedido.assignedToId })
        await onCorregido?.({ demo: cambios })
        return
      }
      // Misma clave mientras el cuerpo sea el mismo (reintento seguro tras un
      // corte de red); otro cuerpo, otra operación.
      const firma = JSON.stringify(cuerpo)
      if (!intento.current || intento.current.firma !== firma) intento.current = { firma, key: nuevaClave() }
      await api.post(`/api/orders/${encodeURIComponent(pedido.id)}/payments/${encodeURIComponent(pago.id)}/correction`, cuerpo, { headers: { 'Idempotency-Key': intento.current.key } })
      await onCorregido?.({})
    } catch (cause) {
      console.error('[corregir-pago] no se pudo corregir el pago:', cause)
      // 403/409/422: se muestra el mensaje del servidor tal cual.
      setError(cause?.message || 'No se pudo corregir el pago.')
    } finally { setBusy(false) }
  }

  const listo = !problema
  return <Modal open onClose={() => !busy && onClose()} busy={busy} title="Corregir medio de pago" size="amplio">
    <form onSubmit={enviar} className="space-y-5" aria-label="Corregir pago">
      <section aria-label="Pago original" className="rounded-2xl border border-ink-600 p-4">
        <p className="text-xs text-mute">Pago original</p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <strong className="text-xl tabular-nums" data-testid="correccion-original">{gs(original.amountPyg)}</strong>
          <span className="text-sm">{ETIQUETAS_MEDIO_PAGO[pago.method] || pago.medioPago}{nombreOriginal && nombreOriginal !== (ETIQUETAS_MEDIO_PAGO[pago.method] || pago.medioPago) ? ` · ${nombreOriginal}` : ''}</span>
        </div>
        <p className="mt-1 text-xs text-mute">{new Date(pago.fecha || pago.paidAt || pago.createdAt).toLocaleString('es-PY')} · Queda registrado y se revierte; no se edita.</p>
      </section>

      <label className="block text-sm font-medium">Motivo de la corrección
        <Textarea className="mt-1" rows={2} required maxLength={MOTIVO_MAX} aria-label="Motivo de la corrección" placeholder="Ej.: se cobró por transferencia pero el cliente pagó en efectivo" value={motivo} onChange={(event) => { setMotivo(event.target.value); setError('') }} />
      </label>

      <section aria-label="Pagos nuevos" className="space-y-3">
        <h3 className="text-sm font-medium">Cómo se cobró realmente</h3>
        {filas.map((fila, indice) => <div key={fila.key} className="rounded-xl border border-ink-600 p-3" data-testid="correccion-fila">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_11rem_auto] md:items-center">
            <CuentaCobroCombobox value={fila.accountId} accounts={cuentasPyg} onChange={(accountId) => cambiarFila(fila.key, { accountId })} disabled={busy} />
            <MoneyInput aria-label={`Monto del pago nuevo ${indice + 1}`} value={fila.amount} onValueChange={(amount) => cambiarFila(fila.key, { amount })} disabled={busy} />
            {filas.length > 1
              ? <button type="button" aria-label={`Quitar pago nuevo ${indice + 1}`} className="grid h-11 w-11 place-items-center rounded-lg border border-ink-600 text-mute transition hover:text-bad" onClick={() => setFilas((actuales) => actuales.filter((item) => item.key !== fila.key))}><Icon name="close" className="h-4 w-4" /></button>
              : <span className="hidden md:block md:w-11" />}
          </div>
          {repartidorPosible && kindDe(fila.accountId) === 'CASH' && <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={fila.toDriver} disabled={busy} onChange={(event) => cambiarFila(fila.key, { toDriver: event.target.checked })} />
            Efectivo al repartidor <span className="text-xs text-mute">(queda pendiente hasta su rendición)</span>
          </label>}
        </div>)}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" disabled={busy || restante <= 0} onClick={() => setFilas((actuales) => [...actuales, filaNueva(restante > 0 ? restante : '')])}><Icon name="plus" className="h-3.5 w-3.5" />Dividir en otro medio</Button>
          <p role="status" data-testid="correccion-restante" className={`text-sm font-semibold tabular-nums ${restante === 0 ? 'text-ok' : 'text-warn'}`}>
            {restante === 0 ? 'Suma exacta' : restante > 0 ? `Falta repartir ${gs(restante)}` : `Se pasa por ${gs(-restante)}`}
          </p>
        </div>
      </section>

      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={busy || !listo} title={problema || undefined}>{busy ? 'Corrigiendo…' : 'Corregir pago'}</Button>
      </div>
    </form>
  </Modal>
}
