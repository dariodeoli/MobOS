import { listVentas } from '@/lib/storage'
import { ventasDelDia, fechaClave, num, gs } from '@/utils/calculos'
import { Card, Badge } from '@/components/ui'

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
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
          🛵 Delivery de hoy
        </div>
        <Badge color="blue">{deliveries.length} envíos</Badge>
      </div>
      <div className="text-2xl font-extrabold text-fono mt-0.5">{gs(totalDelivery)}</div>
      <p className="text-[11px] text-slate-400 mb-2">
        Total a pagar al delivery por los envíos de hoy.
      </p>

      {deliveries.length > 0 && (
        <div className="rounded-lg bg-slate-50 divide-y divide-slate-100">
          {deliveries.map((v) => (
            <div key={v.id} className="flex items-center justify-between px-2.5 py-1.5 text-xs">
              <span className="truncate text-slate-600">{v.cliente || '—'}</span>
              <span className="font-bold text-slate-700 shrink-0 ml-2">
                {gs(v.montoDelivery)}
              </span>
            </div>
          ))}
        </div>
      )}

      {encomiendas.length > 0 && (
        <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2 text-xs">
          <span className="text-slate-500">
            📦 Encomiendas ({encomiendas.length})
          </span>
          <span className="font-bold text-slate-700">{gs(totalEnc)}</span>
        </div>
      )}
    </Card>
  )
}
