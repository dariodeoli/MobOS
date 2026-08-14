import { useState } from 'react'
import { listVentas, productosById } from '@/lib/storage'
import { productosGanadores, gs } from '@/utils/calculos'
import { PeriodoTabs } from '@/components/control/Ganancias'
import { Card, Badge } from '@/components/ui'

const MEDALLA = ['', '', '']

export default function Ganadores() {
  const [periodo, setPeriodo] = useState('dia')
  const top = productosGanadores(periodo, listVentas(), productosById(), 8)

  return (
    <div className="space-y-4">
      <PeriodoTabs periodo={periodo} setPeriodo={setPeriodo} />
      <Card>
        <h2 className="font-bold mb-3">Productos ganadores</h2>
        {top.length === 0 ? (
          <div className="py-8 text-center text-mute text-sm">
            Todavía no hay ventas en este período.
          </div>
        ) : (
          <div className="space-y-2">
            {top.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-xl border border-ink-600 p-3"
              >
                <div className="text-xl w-7 text-center">{MEDALLA[i] || `#${i + 1}`}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{p.nombre}</div>
                  <div className="text-xs text-mute">{p.cantidad} unidades vendidas</div>
                </div>
                <Badge color="blue">{gs(p.monto)}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
