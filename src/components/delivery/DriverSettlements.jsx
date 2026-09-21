import { useMemo, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { Aviso, Badge, Button, Modal, Money, Textarea, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { fechaHoraCorta } from '@/utils/fecha'
import { codigoPedido } from '@/utils/pedido'
import { useSellerData, SellerFeedback } from '@/components/ventas/SellerData'
import { deliveryFields, settlementFields, MEDIO_LABELS, RENDICION_LABELS, SIN_DATOS } from './datos'

const TONO = (estado) => estado === 'VERIFIED' ? 'green' : estado === 'REJECTED' ? 'red' : 'orange'

function ResumenRendicion({ fila }) {
  return (
    <article data-testid="rendicion" className="rounded-2xl border border-fore/10 bg-ink-800/40 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">{fechaHoraCorta(fila.fecha)}</span>
        <Badge color={TONO(fila.estado)}>{RENDICION_LABELS[fila.estado] || fila.estado}</Badge>
      </header>
      <div className="mt-3 space-y-1">
        <p className="flex items-baseline justify-between gap-3"><span className="text-xs text-mute">Rendido</span><span className="text-sm font-bold tabular-nums"><Money value={fila.total} /></span></p>
        <p className="flex items-baseline justify-between gap-3"><span className="text-xs text-mute">Quedó pendiente en los pedidos</span><span className="text-sm tabular-nums"><Money value={fila.pendiente} /></span></p>
        <p className="text-xs text-mute">{fila.pedidos} {fila.pedidos === 1 ? 'pedido' : 'pedidos'} · {fila.cobros.length} {fila.cobros.length === 1 ? 'cobro' : 'cobros'}</p>
        {fila.nota && <p className="text-xs text-mute">Observación: {fila.nota}</p>}
        {fila.verificadaPor && <p className="text-xs text-ok">Verificada por {fila.verificadaPor}{fila.notaVerificacion ? ` · ${fila.notaVerificacion}` : ''}</p>}
      </div>
      <ul className="mt-3 space-y-1 border-t border-fore/10 pt-2">
        {fila.cobros.map(cobro => (
          <li key={cobro.id} className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <span className="font-mono text-mute">{codigoPedido(cobro.pedidoNumero || '—')}</span>
            <span className="text-mute">{MEDIO_LABELS[cobro.metodo] || cobro.metodo}{cobro.referencia ? ` · ${cobro.referencia}` : ''}</span>
            <span className="font-semibold tabular-nums"><Money value={cobro.monto} /></span>
          </li>
        ))}
      </ul>
    </article>
  )
}

export default function DriverSettlements() {
  const { esDemo } = useSesion()
  const toast = useToast()
  const pedidos = useSellerData('/api/delivery/orders?estado=todos', deliveryFields, SIN_DATOS, esDemo, { limit: 100 })
  const historial = useSellerData('/api/delivery/settlements', settlementFields, SIN_DATOS, esDemo, { limit: 60 })
  const [abierto, setAbierto] = useState(false)
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const porRendir = useMemo(() => pedidos.rows.flatMap(row => row.cobros.map(cobro => ({ ...cobro, pedido: row })))
    .sort((a, b) => new Date(a.cobradoEn).getTime() - new Date(b.cobradoEn).getTime()), [pedidos.rows])
  const totalPorRendir = porRendir.reduce((suma, cobro) => suma + cobro.monto, 0)
  const saldoPendiente = useMemo(() => pedidos.rows.reduce((suma, row) => suma + (row.fulfillment === 'DELIVERED' ? row.pendiente : 0), 0), [pedidos.rows])

  async function rendir() {
    if (enviando) return
    setEnviando(true); setError('')
    try {
      const rendicion = await api.post('/api/delivery/settlements', { ...(nota.trim() ? { note: nota.trim() } : {}) })
      toast.success('Rendición registrada', `Queda pendiente de verificación por la tienda (${rendicion.payments?.length || 0} cobros).`)
      setAbierto(false); setNota('')
      pedidos.refresh(); historial.refresh()
    } catch (cause) {
      setError(cause?.message || 'No se pudo registrar la rendición.')
    } finally { setEnviando(false) }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-fono/25 bg-gradient-to-br from-fono/10 to-ink-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-mute">Para rendir en la tienda</p>
            <p className="mt-1 text-2xl font-bold tabular-nums" data-testid="rendicion-total"><Money value={totalPorRendir} /></p>
            <p className="mt-1 text-xs text-mute">{porRendir.length} {porRendir.length === 1 ? 'cobro' : 'cobros'} de la calle · saldo pendiente en pedidos entregados: <Money value={saldoPendiente} /></p>
          </div>
          <Button type="button" disabled={!porRendir.length} onClick={() => { setError(''); setAbierto(true) }} data-testid="rendir-abrir">
            <Icon name="receipt" className="h-4 w-4" />Rendir
          </Button>
        </div>
      </section>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Mis rendiciones</h2>
        <SellerFeedback {...historial} empty={!historial.rows.length} />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {historial.rows.map(fila => <ResumenRendicion key={fila.id} fila={fila} />)}
        </div>
      </div>

      <Modal open={abierto} onClose={() => !enviando && setAbierto(false)} title="Rendir lo cobrado" className="max-w-lg">
        <div className="space-y-3">
          <p className="text-sm text-mute">Entregás en la tienda estos cobros de la calle. La tienda los verifica y recién ahí quedan confirmados.</p>
          <ul className="max-h-64 space-y-2 overflow-auto rounded-xl border border-fore/10 bg-ink-700/30 p-3">
            {porRendir.map(cobro => (
              <li key={cobro.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-mono text-xs text-mute">{codigoPedido(cobro.pedido.number)}</span>
                <span className="text-xs text-mute">{cobro.pedido.cliente} · {MEDIO_LABELS[cobro.metodo] || cobro.metodo}{cobro.referencia ? ` · ${cobro.referencia}` : ''}</span>
                <span className="font-semibold tabular-nums"><Money value={cobro.monto} /></span>
              </li>
            ))}
          </ul>
          <p className="flex items-baseline justify-between"><span className="text-sm font-semibold">Total a rendir</span><span className="text-lg font-bold tabular-nums"><Money value={totalPorRendir} /></span></p>
          <div>
            <label htmlFor="rendicion-nota" className="block text-sm font-semibold">Observación (opcional)</label>
            <Textarea id="rendicion-nota" className="mt-2" rows={2} maxLength={500} value={nota} onChange={event => setNota(event.target.value)} placeholder="Ej.: dos transferencias quedaron acreditadas al mediodía" />
          </div>
          {error && <Aviso tono="error">{error}</Aviso>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={enviando} onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button type="button" disabled={enviando} onClick={rendir} data-testid="rendir-confirmar">{enviando ? 'Registrando…' : 'Rendir'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
