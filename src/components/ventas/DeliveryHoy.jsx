import { listVentas } from '@/lib/storage'
import { ventasDelDia, fechaClave, num, gs } from '@/utils/calculos'
import { Card } from '@/components/ui'
import Icon from '@/components/shared/Icon'

// Muestra, en vivo, lo que se acumuló hoy en envíos. Sirve para cuadrar la
// cuenta con el delivery (motoboy) al final del día: cada renglón es un envío.
export default function DeliveryHoy() {
  const hoy = ventasDelDia(listVentas(), fechaClave())
  const deliveries = hoy.filter((v) => v.entrega === 'Delivery')
  const encomiendas = hoy.filter((v) => v.entrega === 'Encomienda')

  const totalDelivery = deliveries.reduce((a, v) => a + num(v.montoDelivery), 0)
  const totalEnc = encomiendas.reduce((a, v) => a + num(v.montoDelivery), 0)

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-mute">
          <Icon name="truck" className="h-4 w-4" />
          Delivery de hoy
        </div>
        <span className="text-xs text-mute">{deliveries.length} envíos</span>
      </div>

      <div className="mt-1.5 text-2xl font-semibold tracking-tight">{gs(totalDelivery)}</div>
      <p className="mt-0.5 text-xs text-mute">Total a pagar al delivery por los envíos de hoy.</p>

      {deliveries.length > 0 && (
        <div className="mt-3 divide-y divide-ink-600 rounded-lg border border-ink-600">
          {deliveries.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="truncate text-mute">{v.cliente || '—'}</span>
              <span className="shrink-0 font-medium">{gs(v.montoDelivery)}</span>
            </div>
          ))}
        </div>
      )}

      {encomiendas.length > 0 && (
        <div className="mt-2 flex items-center justify-between rounded-lg border border-ink-600 px-3 py-2 text-sm">
          <span className="inline-flex items-center gap-1.5 text-mute">
            <Icon name="package" className="h-4 w-4" />
            Encomiendas ({encomiendas.length})
          </span>
          <span className="font-medium">{gs(totalEnc)}</span>
        </div>
      )}
    </Card>
  )
}
