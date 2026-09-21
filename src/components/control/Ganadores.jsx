import { useEffect, useState } from 'react'
import { useUrlState } from '@/hooks/useUrlState'
import { isDemoRuntime } from '@/lib/demoMode'
import { listVentas, productosById } from '@/lib/storage'
import { desdeDePeriodo, fechaClave, gs, productosGanadores } from '@/utils/calculos'
import { reporteMetricas } from '@/lib/metricas'
import { topProductos } from '@/lib/metricasNucleo'
import PeriodoTabs from '@/components/shared/PeriodoTabs'
import { Card, Badge, EmptyState } from '@/components/ui'

const MEDALLA = ['', '', '']

// Ganadores (#171, fase 2 de #145): los productos salen del mismo backend de
// métricas que Resumen y Reportes (cantidades reales por línea, sin el tope de
// la caché local). En demo u offline sigue el cálculo local.
export default function Ganadores() {
  const [periodo, setPeriodo] = useUrlState('periodo', 'dia')
  const [topApi, setTopApi] = useState(null)

  useEffect(() => {
    if (isDemoRuntime) { setTopApi(null); return }
    let vigente = true
    reporteMetricas({ rango: { desde: desdeDePeriodo(periodo), hasta: fechaClave() }, groupBy: 'product' })
      .then((datos) => { if (vigente) setTopApi(topProductos(datos?.groups, 8)) })
      .catch(() => { if (vigente) setTopApi(null) })
    return () => { vigente = false }
  }, [periodo])

  const top = topApi?.length ? topApi : productosGanadores(periodo, listVentas(), productosById(), 8)

  return (
    <div className="space-y-4">
      <PeriodoTabs periodo={periodo} setPeriodo={setPeriodo} />
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">Productos ganadores</h2>
          <span className="text-xs text-mute">Cantidad y venta por línea del período</span>
        </div>
        {top.length === 0 ? (
          <EmptyState compact icon="box" title="Todavía no hay ventas en este período." />
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
