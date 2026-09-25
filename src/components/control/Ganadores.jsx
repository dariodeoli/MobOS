import { useEffect, useState } from 'react'
import { useUrlState } from '@/hooks/useUrlState'
import { isDemoRuntime } from '@/lib/demoMode'
import { listVentas, productosById } from '@/lib/storage'
import { desdeDePeriodo, fechaClave, gs, productosGanadores } from '@/utils/calculos'
import { reporteMetricas } from '@/lib/metricas'
import { topProductos } from '@/lib/metricasNucleo'
import PeriodoTabs from '@/components/shared/PeriodoTabs'
import { formatPercent } from '@/components/shared/PercentField'
import { Card, Badge, EmptyState } from '@/components/ui'

const MEDALLA = ['', '', '']

// Ganadores (#171, fase 2 de #145): los productos salen del mismo backend de
// métricas que Resumen y Reportes (cantidades reales por línea, sin el tope de
// la caché local). El ranking es por ganancia real del período (costos
// congelados de cada venta); si la tienda todavía no cargó costos, se ordena
// por venta y se avisa. En demo u offline sigue el cálculo local.
export default function Ganadores() {
  const [periodo, setPeriodo] = useUrlState('periodo', 'dia')
  const [topApi, setTopApi] = useState(null)

  useEffect(() => {
    if (isDemoRuntime) { setTopApi(null); return }
    let vigente = true
    reporteMetricas({ rango: { desde: desdeDePeriodo(periodo), hasta: fechaClave() }, groupBy: 'product' })
      .then((datos) => {
        if (!vigente) return
        setTopApi({
          filas: topProductos(datos?.groups, 8, 'ganancia'),
          hayCostos: Number(datos?.totals?.costPyg || 0) > 0,
        })
      })
      .catch(() => { if (vigente) setTopApi(null) })
    return () => { vigente = false }
  }, [periodo])

  const local = productosGanadores(periodo, listVentas(), productosById(), 8, { criterio: 'ganancia' })
  const top = topApi?.filas?.length ? topApi.filas : local
  const hayCostos = topApi ? topApi.hayCostos : local.some((p) => p.ganancia !== null && p.ganancia !== undefined)

  return (
    <div className="space-y-4">
      <PeriodoTabs periodo={periodo} setPeriodo={setPeriodo} />
      <Card data-testid="ganadores">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">Productos ganadores</h2>
          <span className="text-xs text-mute">
            {hayCostos ? 'Ordenado por ganancia del período' : 'Sin costos cargados: ordenado por venta'}
          </span>
        </div>
        {top.length === 0 ? (
          <EmptyState compact icon="box" title="Todavía no hay ventas en este período." />
        ) : (
          <div className="space-y-2">
            {top.map((p, i) => {
              const conGanancia = p.ganancia !== null && p.ganancia !== undefined
              return (
                <div
                  key={p.id}
                  data-testid="ganadores-fila"
                  className="flex items-center gap-3 rounded-xl border border-ink-600 p-3"
                >
                  <div className="text-xl w-7 text-center">{MEDALLA[i] || `#${i + 1}`}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{p.nombre}</div>
                    <div className="text-xs text-mute">
                      {p.cantidad} unidad{p.cantidad === 1 ? '' : 'es'} vendida{p.cantidad === 1 ? '' : 's'} · venta {gs(p.monto)}
                      {conGanancia && p.margenPct !== null ? ` · margen ${formatPercent(p.margenPct)}%` : ''}
                    </div>
                  </div>
                  {conGanancia ? (
                    <div className="shrink-0 text-right">
                      <div className={`text-sm font-bold ${p.ganancia >= 0 ? 'text-ok' : 'text-bad'}`}>{gs(p.ganancia)}</div>
                      <div className="text-[10px] uppercase tracking-wide text-mute">Ganancia</div>
                    </div>
                  ) : (
                    <Badge color="blue">{gs(p.monto)}</Badge>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
