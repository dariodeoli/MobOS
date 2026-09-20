import { useEffect, useState } from 'react'
import { api } from '@/lib/api/client'
import { listVentas } from '@/lib/storage'
import { gs } from '@/utils/calculos'
import { Badge, Button, Card, EmptyState } from '@/components/ui'
import PagosPedido from '@/components/ventas/PagosPedido'

// Cuotas por cobrar (planes de crédito): vencidas primero, luego próximas.
// Cada fila permite avisar por WhatsApp y abrir el pedido para registrar el
// cobro de la cuota.
export default function Cobranzas() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [pedido, setPedido] = useState(null)

  useEffect(() => {
    api.get('/api/payments/due').then(setRows).catch((cause) => setError(cause?.message || 'No se pudieron cargar las cuotas.'))
  }, [])

  const hoy = Date.now()
  const vencidas = (rows || []).filter((pago) => new Date(pago.dueAt).getTime() <= hoy)
  const proximas = (rows || []).filter((pago) => new Date(pago.dueAt).getTime() > hoy)
  const totalPendiente = (rows || []).reduce((suma, pago) => suma + Number(pago.amountPyg || 0), 0)

  function whatsapp(pago) {
    const telefono = pago.order?.customer?.phone
    if (!telefono) return ''
    const numero = String(pago.order.customer.countryCode || '+595').replace(/\D/g, '') + String(telefono).replace(/\D/g, '').replace(/^0+/, '')
    const nombre = pago.order?.customer?.name || ''
    const vence = new Date(pago.dueAt).toLocaleDateString('es-PY')
    const mensaje = `Hola${nombre ? ` ${nombre}` : ''}, te recordamos la cuota de Gs. ${Number(pago.amountPyg).toLocaleString('es-PY')} del pedido ${pago.order?.orderNumber || ''} (vence ${vence}). Podés coordinar el pago con nosotros.`
    return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`
  }

  function abrirPedido(pago) {
    const venta = listVentas().find((item) => item.id === pago.order?.id)
    if (venta) setPedido(venta)
  }

  const Fila = ({ pago, vencida }) => (
    <article className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 p-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-sm">{pago.order?.customer?.name || 'Cliente'}</b>
          <span className="font-mono text-[11px] text-mute">{pago.order?.orderNumber || ''}</span>
          <Badge color={vencida ? 'red' : 'orange'}>{pago.reference || 'Cuota'}</Badge>
        </div>
        <p className="mt-1 text-xs text-mute">Vence {new Date(pago.dueAt).toLocaleDateString('es-PY')} · <b className="text-fore">{gs(pago.amountPyg)}</b></p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {whatsapp(pago) && <a className="rounded-lg bg-ok px-3 py-2 text-xs font-semibold text-black" href={whatsapp(pago)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
        <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => abrirPedido(pago)}>Abrir pedido</Button>
      </div>
    </article>
  )

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm text-mute">Planes de crédito con vencimiento: avisá por WhatsApp y cobrá cada cuota desde su pedido.</p>
          </div>
          <Badge color={totalPendiente > 0 ? 'orange' : 'green'}>Pendiente total {gs(totalPendiente)}</Badge>
        </div>
        {error && <p role="alert" className="mt-3 rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{error}</p>}
      </Card>
      {rows !== null && rows.length === 0 && <Card><EmptyState compact icon="check" title="Sin cuotas pendientes." description="Los planes de crédito aparecerán acá con su vencimiento." /></Card>}
      {vencidas.length > 0 && <section><h3 className="text-xs font-bold uppercase tracking-wider text-bad">Vencidas ({vencidas.length})</h3><div className="mt-2 space-y-2">{vencidas.map((pago) => <Fila key={pago.id} pago={pago} vencida />)}</div></section>}
      {proximas.length > 0 && <section><h3 className="text-xs font-bold uppercase tracking-wider text-mute">Próximas ({proximas.length})</h3><div className="mt-2 space-y-2">{proximas.map((pago) => <Fila key={pago.id} pago={pago} />)}</div></section>}
      {pedido && <PagosPedido venta={pedido} onClose={() => setPedido(null)} />}
    </div>
  )
}
