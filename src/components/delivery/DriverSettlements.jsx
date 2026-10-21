import { useCallback, useMemo, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { Aviso, Badge, Button, Money, Textarea, useToast } from '@/components/ui'
import Popup from '@/components/shared/Popup'
import '@/components/shared/operacionRediseno.css'
import Icon from '@/components/shared/Icon'
import { fechaHoraCorta } from '@/utils/fecha'
import { codigoPedido } from '@/utils/pedido'
import ListaDensa from '@/components/shared/ListaDensa'
import { usePaginaLista } from '@/components/shared/usePaginaLista'
import './entregasF3.css'
import { useSellerData, SellerFeedback } from '@/components/ventas/SellerData'
import { deliveryFields, settlementFields, MEDIO_LABELS, RENDICION_LABELS } from './datos'
import { crearRendicionDemo, listDemoDeliveryOrdersDelRepartidor, listDemoDeliverySettlementsDelRepartidor } from '@/lib/demo/delivery.js'

const TONO = (estado) => estado === 'VERIFIED' ? 'green' : estado === 'REJECTED' ? 'red' : 'orange'

function ResumenRendicion({ fila }) {
  return (
    <article data-testid="rendicion" className="entregas-f3-order">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">{fechaHoraCorta(fila.fecha)}</span>
        <Badge color={TONO(fila.estado)}>{RENDICION_LABELS[fila.estado] || fila.estado}</Badge>
      </header>
      <div className="entregas-f3-amounts">
        <span>Rendido <strong className="text-fore"><Money value={fila.total} /></strong></span>
        <span>Quedó pendiente en los pedidos <strong><Money value={fila.pendiente} /></strong></span>
      </div>
      <p className="entregas-f3-meta">{fila.pedidos} {fila.pedidos === 1 ? 'pedido' : 'pedidos'} · {fila.cobros.length} {fila.cobros.length === 1 ? 'cobro' : 'cobros'}</p>
      {fila.nota && <p className="entregas-f3-meta">Observación: {fila.nota}</p>}
      {fila.verificadaPor && <p className="entregas-f3-meta text-ok">Verificada por {fila.verificadaPor}{fila.notaVerificacion ? ` · ${fila.notaVerificacion}` : ''}</p>}
      <ul className="entregas-f3-cobros">
        {fila.cobros.map(cobro => (
          <li key={cobro.id}>
            <span className="font-mono text-mute">{codigoPedido(cobro.pedidoNumero || '—')}</span>
            <span className="text-mute">{MEDIO_LABELS[cobro.metodo] || cobro.metodo}{cobro.referencia ? ` · ${cobro.referencia}` : ''}</span>
            <strong><Money value={cobro.monto} /></strong>
          </li>
        ))}
      </ul>
    </article>
  )
}

export default function DriverSettlements() {
  const { esDemo } = useSesion()
  const toast = useToast()
  // #324: pedidos e historial salen de la fixture demo (mismo contrato).
  const demoPedidos = useCallback(() => listDemoDeliveryOrdersDelRepartidor({}), [])
  const demoHistorial = useCallback(() => listDemoDeliverySettlementsDelRepartidor({}), [])
  const pedidos = useSellerData('/api/delivery/orders?estado=todos', deliveryFields, demoPedidos, esDemo, { limit: 100 })
  const historial = useSellerData('/api/delivery/settlements', settlementFields, demoHistorial, esDemo, { limit: 60 })
  const pagina = usePaginaLista(historial.rows, { tamano: 10, modo: 'mas' })
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
      const rendicion = esDemo
        ? crearRendicionDemo()
        : await api.post('/api/delivery/settlements', { ...(nota.trim() ? { note: nota.trim() } : {}) })
      toast.success('Rendición registrada', `Queda pendiente de verificación por la tienda (${rendicion.payments?.length || 0} cobros).`)
      setAbierto(false); setNota('')
      pedidos.refresh(); historial.refresh()
    } catch (cause) {
      setError(cause?.message || 'No se pudo registrar la rendición.')
    } finally { setEnviando(false) }
  }

  return (
    <div className="op-rd entregas-f3-assignments">
      <section className="entregas-f3-order entregas-f3-summary" aria-label="Para rendir en la tienda">
        <p className="entregas-f3-meta">Para rendir en la tienda</p>
        <p className="entregas-f3-total" data-testid="rendicion-total"><Money value={totalPorRendir} /></p>
        <p className="entregas-f3-meta">{porRendir.length} {porRendir.length === 1 ? 'cobro' : 'cobros'} de la calle · saldo pendiente en pedidos entregados: <Money value={saldoPendiente} /></p>
        <div className="entregas-f3-actions">
          <Button type="button" disabled={!porRendir.length} onClick={() => { setError(''); setAbierto(true) }} data-testid="rendir-abrir">
            <Icon name="receipt" className="h-4 w-4" />Rendir
          </Button>
        </div>
      </section>

      <div className="entregas-f3-assignments">
        <h2 className="text-sm font-semibold">Mis rendiciones</h2>
        <SellerFeedback {...historial} empty={!historial.rows.length} />
        <ListaDensa
          lista={pagina}
          claseFilas="entregas-f3-grid"
          etiquetaPie="Más rendiciones"
          unidad="rendiciones"
          renderFila={fila => <ResumenRendicion key={fila.id} fila={fila} />}
        />
      </div>

      <Popup
        open={abierto}
        onClose={() => !enviando && setAbierto(false)}
        busy={enviando}
        title="Rendir lo cobrado"
        acciones={{
          secundaria: { label: 'Cancelar', disabled: enviando, onClick: () => setAbierto(false) },
          primaria: { label: enviando ? 'Registrando…' : 'Rendir', disabled: enviando, onClick: rendir, 'data-testid': 'rendir-confirmar' },
        }}
      >
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
        </div>
      </Popup>
    </div>
  )
}
