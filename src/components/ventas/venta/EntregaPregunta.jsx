import { useState } from 'react'
import { Button } from '@/components/ui'
import { api } from '@/lib/api/client'
import { marcarEntregaDemo } from '@/lib/demoCreditoStore'
import { gs } from '@/utils/calculos'
import { cn } from '@/lib/utils'

// «¿El cliente ya se llevó el producto?» al cerrar una venta de mostrador.
// Una venta NUNCA se marca Retirada sola: el vendedor lo confirma acá. Por
// defecto queda «En preparación»; «Todavía no» no cambia nada. Si queda saldo,
// se avisa antes: entregar con saldo lo controla el servidor (crédito del
// cliente o autorización de gerencia).
const saldoDe = (order) => {
  const pagos = order?.payments || order?.pagos || []
  const pagado = pagos
    .filter((pago) => pago.status === 'CONFIRMED' || pago.status === undefined)
    .reduce((suma, pago) => suma + Number(pago.amountPyg ?? pago.monto ?? 0), 0)
  return Math.max(0, Number(order?.totalPyg ?? order?.total ?? 0) - pagado)
}

export default function EntregaPregunta({ order, esDemo, onEntregado, onNoTodavia, className }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const saldo = saldoDe(order)

  async function confirmar() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      if (esDemo) marcarEntregaDemo({ orderNumber: order.orderNumber || order.number, estado: 'PICKED_UP' })
      else await api.patch(`/api/orders/${encodeURIComponent(order.id)}`, { fulfillmentStatus: 'PICKED_UP' })
      onEntregado?.('PICKED_UP')
    } catch (cause) {
      setError(cause?.message || 'No se pudo marcar el pedido como retirado.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-testid="entrega-pregunta" role="group" aria-label="Entrega del producto" className={cn('space-y-2 rounded-2xl border border-info/35 bg-info/[.06] p-3 text-sm', className)}>
      <p className="font-bold">¿El cliente ya se llevó el producto?</p>
      <p className="text-xs text-mute">
        Si todavía no, el pedido queda «En preparación» y lo marcás Retirado cuando lo retire.
        {saldo > 0 ? ` Queda un saldo de ${gs(saldo)} sin cobrar.` : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" data-testid="entrega-si" className="min-h-11 flex-1" disabled={busy} onClick={confirmar}>
          {busy ? 'Guardando…' : 'Sí, ya se lo llevó'}
        </Button>
        <Button type="button" variant="outline" data-testid="entrega-no" className="min-h-11 flex-1" disabled={busy} onClick={() => onNoTodavia?.()}>
          Todavía no
        </Button>
      </div>
      {error && <p role="alert" data-testid="entrega-error" className="text-xs font-semibold text-bad-text">{error}</p>}
    </div>
  )
}
