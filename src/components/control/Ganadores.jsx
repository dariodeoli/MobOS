import { useEffect, useState } from 'react'
import '@/components/shared/gestionProfundo.css'
import { useUrlState } from '@/hooks/useUrlState'
import { isDemoRuntime } from '@/lib/demoMode'
import { listVentas, productosById } from '@/lib/storage'
import { desdeDePeriodo, fechaClave, gs, productosGanadores } from '@/utils/calculos'
import { reporteMetricas } from '@/lib/metricas'
import { topProductos } from '@/lib/metricasNucleo'
import PeriodoTabs from '@/components/shared/PeriodoTabs'
import { formatPercent } from '@/components/shared/PercentField'
import { EmptyState } from '@/components/ui'
import { GraficoBarras, TarjetaGrafico } from '@/components/shared/graficos'

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
    <div className="gp space-y-4" data-testid="ganadores-pagina">
      <PeriodoTabs periodo={periodo} setPeriodo={setPeriodo} />
      <TarjetaGrafico
        testId="ganadores"
        titulo="Productos ganadores"
        detalle={hayCostos ? 'Ordenado por ganancia del período' : 'Sin costos cargados: ordenado por venta'}
      >
        {top.length === 0 ? (
          <EmptyState compact icon="box" title="Todavía no hay ventas en este período." />
        ) : (
          <GraficoBarras
            etiqueta="Productos ganadores"
            testIdItem="ganadores-fila"
            items={top.map((p) => {
              const conGanancia = p.ganancia !== null && p.ganancia !== undefined
              return {
                clave: p.id,
                etiqueta: p.nombre,
                valor: conGanancia ? p.ganancia : p.monto,
                extra: <span className="shrink-0 text-xs text-mute">{conGanancia ? 'Ganancia' : 'Venta'}</span>,
                sub: `${p.cantidad} u. · venta ${gs(p.monto)}${conGanancia && p.margenPct !== null ? ` · margen ${formatPercent(p.margenPct)}%` : ''}`,
              }
            })}
          />
        )}
      </TarjetaGrafico>
    </div>
  )
}
