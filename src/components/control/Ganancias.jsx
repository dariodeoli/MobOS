import { useEffect, useState } from 'react'
import { useUrlState } from '@/hooks/useUrlState'
import { isDemoRuntime } from '@/lib/demoMode'
import { listVentas, listGastos, listAds, productosById } from '@/lib/storage'
import { fechaClave, gs } from '@/utils/calculos'
import { desdeDePeriodo, gananciaDelPeriodo, lineasDeGanancia, serieDeReporte } from '@/utils/ganancias'
import { reporteMetricas } from '@/lib/metricas'
import { Card, Badge } from '@/components/ui'
import PeriodoTabs from '@/components/shared/PeriodoTabs'
import CalendarioGanancias, { LineaValor } from '@/components/shared/CalendarioGanancias'

// Ganancias: resultado del período y calendario por día. Los cálculos viven en
// `utils/ganancias` (#181) y el calendario es compartido; esta vista solo los
// compone. Ingresos y costo salen del backend unificado (#171); gastos y
// publicidad siguen en Finanzas. Sin API (demo/offline) rige el cálculo local.
export default function Ganancias() {
  const [periodo, setPeriodo] = useUrlState('periodo', 'dia')
  const datos = {
    ventas: listVentas(),
    gastos: listGastos(),
    ads: listAds(),
    prodsById: productosById(),
  }
  const [serieApi, setSerieApi] = useState(null)
  useEffect(() => {
    if (isDemoRuntime) { setSerieApi(null); return }
    let vigente = true
    reporteMetricas({ rango: { desde: desdeDePeriodo(periodo), hasta: fechaClave() }, groupBy: 'day' })
      .then((data) => { if (vigente) setSerieApi(serieDeReporte(data)) })
      .catch(() => { if (vigente) setSerieApi(null) })
    return () => { vigente = false }
  }, [periodo])
  const g = gananciaDelPeriodo(periodo, datos, serieApi?.totales)

  const positivo = g.estado === 'ganancia'
  const negativo = g.estado === 'perdida'

  return (
    <div className="space-y-4">
      <PeriodoTabs periodo={periodo} setPeriodo={setPeriodo} />

      {/* Resultado grande */}
      <Card
        className={
          positivo ? 'bg-ok/10 border-ok/30' : negativo ? 'bg-bad/10 border-bad/30' : 'bg-ink-800'
        }
      >
        <div className="text-xs font-bold uppercase tracking-wide text-mute">
          {positivo ? 'Ganancia' : negativo ? 'Pérdida' : 'Empate'} del período
        </div>
        <div
          data-testid="ganancia-resultado"
          className={
            'text-4xl font-extrabold mt-1 tracking-tight ' +
            (positivo ? 'text-ok' : negativo ? 'text-bad' : 'text-fore')
          }
        >
          {gs(g.ganancia)}
        </div>
        <div className="text-sm text-mute mt-1">{g.cantVentas} ventas en el período</div>
      </Card>

      {/* Calendario de resultados por día */}
      <CalendarioGanancias datos={datos} serieApi={serieApi} />

      {/* Desglose */}
      <Card>
        <h3 className="font-bold mb-3">Cómo se calcula</h3>
        <div className="space-y-2 text-sm">
          {lineasDeGanancia(g).map((linea) => <LineaValor key={linea.label} {...linea} />)}
          <div className="border-t border-ink-600 pt-2 flex items-center justify-between font-extrabold">
            <span>Resultado</span>
            <span className={positivo ? 'text-ok' : negativo ? 'text-bad' : 'text-fore'}>
              {gs(g.ganancia)}
            </span>
          </div>
        </div>
        {negativo && (
          <div className="mt-3">
            <Badge color="red">
              Te faltan {gs(Math.abs(g.ganancia))} para cubrir tus costos del período
            </Badge>
          </div>
        )}
      </Card>
    </div>
  )
}
