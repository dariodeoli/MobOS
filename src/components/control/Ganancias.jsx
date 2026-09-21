import { useEffect, useState } from 'react'
import { useUrlState } from '@/hooks/useUrlState'
import { isDemoRuntime } from '@/lib/demoMode'
import { listVentas, listGastos, listAds, productosById } from '@/lib/storage'
import { calcularGanancia, calcularGananciaDia, desdeDePeriodo, fechaClave, gs } from '@/utils/calculos'
import { reporteMetricas } from '@/lib/metricas'
import { Card, Badge } from '@/components/ui'
import PeriodoTabs from '@/components/shared/PeriodoTabs'

export default function Ganancias() {
  const [periodo, setPeriodo] = useUrlState('periodo', 'dia')
  const datos = {
    ventas: listVentas(),
    gastos: listGastos(),
    ads: listAds(),
    prodsById: productosById(),
  }
  // Ingresos y costo del período salen del backend unificado (#171); gastos y
  // publicidad siguen en Finanzas. Sin API (demo/offline) rige el cálculo local.
  const [serieApi, setSerieApi] = useState(null)
  useEffect(() => {
    if (isDemoRuntime) { setSerieApi(null); return }
    let vigente = true
    reporteMetricas({ rango: { desde: desdeDePeriodo(periodo), hasta: fechaClave() }, groupBy: 'day' })
      .then((data) => {
        if (!vigente) return
        setSerieApi({
          totales: data?.totals || null,
          desde: data?.from || '',
          hasta: data?.to || '',
          porDia: new Map((Array.isArray(data?.groups) ? data.groups : []).map((grupo) => [grupo.key, grupo])),
        })
      })
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
          <Linea label="Ingresos por ventas" valor={g.ingresos} signo="+" color="text-ok" />
          <Linea
            label="Costo de mercadería vendida"
            valor={g.costoMercaderia}
            signo="−"
            color="text-mute"
          />
          <Linea label="Gastos" valor={g.totalGastos} signo="−" color="text-mute" />
          <Linea label="Meta Ads" valor={g.totalAds} signo="−" color="text-mute" />
          <div className="border-t border-ink-600 pt-2 flex items-center justify-between font-extrabold">
            <span>{positivo ? '' : negativo ? '' : ''} Resultado</span>
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

// ── Calendario mensual: cada día coloreado por resultado ────────────
const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]
const DIAS_SEMANA = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']

const ESTILO_DIA = {
  ganancia: 'bg-ok/15 text-ok border-ok/30',
  perdida: 'bg-bad/15 text-bad border-bad/30',
  empate: 'bg-warn/15 text-warn border-warn/30',
  vacio: 'bg-ink-800 text-mute border-ink-600',
}

function CalendarioGanancias({ datos, serieApi }) {
  const hoy = new Date()
  const [cursor, setCursor] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1))
  const [sel, setSel] = useState(null)

  const anio = cursor.getFullYear()
  const mes = cursor.getMonth()
  const claveHoy = fechaClave()

  // Día de semana del 1° (0 = lunes) y cantidad de días del mes.
  const offset = (new Date(anio, mes, 1).getDay() + 6) % 7
  const diasEnMes = new Date(anio, mes + 1, 0).getDate()

  const celdas = []
  for (let i = 0; i < offset; i++) celdas.push(null)
  for (let d = 1; d <= diasEnMes; d++) {
    const clave = fechaClave(new Date(anio, mes, d))
    celdas.push({ d, clave, ...gananciaDelDia(clave, datos, serieApi) })
  }

  const irMes = (delta) => {
    setSel(null)
    setCursor(new Date(anio, mes + delta, 1))
  }

  const detalle = sel ? gananciaDelDia(sel, datos, serieApi) : null

  return (
    <Card>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Calendario compacto */}
        <div className="w-full max-w-[300px] shrink-0">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => irMes(-1)}
              className="h-7 w-7 rounded-lg text-mute hover:bg-ink-700 font-bold"
              aria-label="Mes anterior"
            >
              ‹
            </button>
            <span className="text-sm font-bold text-fore">
              {MESES[mes]} {anio}
            </span>
            <button
              onClick={() => irMes(1)}
              className="h-7 w-7 rounded-lg text-mute hover:bg-ink-700 font-bold"
              aria-label="Mes siguiente"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-0.5">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="text-center text-[10px] font-bold text-mute">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {celdas.map((c, i) =>
              c == null ? (
                <div key={`v${i}`} />
              ) : (
                <button
                  key={c.clave}
                  onClick={() => setSel(sel === c.clave ? null : c.clave)}
                  className={
                    'h-9 rounded-md border text-xs font-bold flex items-center justify-center transition ' +
                    ESTILO_DIA[c.estado] +
                    (c.clave === claveHoy ? ' ring-2 ring-fono' : '') +
                    (c.clave === sel ? ' ring-2 ring-fono' : '')
                  }
                >
                  {c.d}
                </button>
              ),
            )}
          </div>

          {/* Leyenda */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-mute">
            <Leyenda color="bg-emerald-300" label="Ganancia" />
            <Leyenda color="bg-red-300" label="Pérdida" />
            <Leyenda color="bg-amber-300" label="Empate" />
            <Leyenda color="bg-ink-600" label="Sin ventas" />
          </div>
        </div>

        {/* Historial del día seleccionado */}
        <div className="flex-1 lg:border-l lg:border-ink-600 lg:pl-4">
          {detalle ? (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-fore">
                  {detalle.estado === 'ganancia'
                    ? 'Ganancia'
                    : detalle.estado === 'perdida'
                      ? 'Pérdida'
                      : detalle.estado === 'empate'
                        ? 'Empate'
                        : 'Sin movimiento'}{' '}
                  · {sel}
                </span>
                <span
                  className={
                    'font-extrabold ' +
                    (detalle.estado === 'ganancia'
                      ? 'text-ok'
                      : detalle.estado === 'perdida'
                        ? 'text-bad'
                        : 'text-fore')
                  }
                >
                  {gs(detalle.ganancia)}
                </span>
              </div>
              <div className="space-y-1.5 text-sm mt-3">
                <Linea
                  label="Ingresos por ventas"
                  valor={detalle.ingresos}
                  signo="+"
                  color="text-ok"
                />
                <Linea
                  label="Costo de mercadería"
                  valor={detalle.costoMercaderia}
                  signo="−"
                  color="text-mute"
                />
                <Linea label="Gastos" valor={detalle.totalGastos} signo="−" color="text-mute" />
                <Linea label="Meta Ads" valor={detalle.totalAds} signo="−" color="text-mute" />
              </div>
              <div className="text-xs text-mute mt-2">{detalle.cantVentas} ventas en el día</div>
            </div>
          ) : (
            <div className="text-sm text-mute py-2">
              Tocá un día para ver su historial de ganancia.
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function Leyenda({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={'h-3 w-3 rounded ' + color} />
      {label}
    </span>
  )
}

function Linea({ label, valor, signo, color }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-mute">{label}</span>
      <span className={'font-bold ' + color}>
        {signo} {gs(valor)}
      </span>
    </div>
  )
}

// ── Ganancias con el backend unificado (#171, fase 2 de #145) ────────
// Ingresos y costo de mercadería salen de /api/reports (sin el tope de 100
// órdenes de la caché); gastos y publicidad siguen viniendo de Finanzas con el
// mismo filtro de período. Sin datos del API rige el cálculo local de siempre.

function gananciaDelPeriodo(periodo, datos, totalesApi) {
  const local = calcularGanancia(periodo, datos)
  if (!totalesApi) return local
  const ingresos = Number(totalesApi.totalPyg || 0)
  const costoMercaderia = Number(totalesApi.costPyg || 0)
  const ganancia = ingresos - costoMercaderia - local.totalGastos - local.totalAds
  return {
    ...local,
    ingresos,
    costoMercaderia,
    ganancia,
    estado: ganancia > 0 ? 'ganancia' : ganancia < 0 ? 'perdida' : 'empate',
    cantVentas: Number(totalesApi.orders || 0),
  }
}

function gananciaDelDia(clave, datos, serieApi) {
  const local = calcularGananciaDia(clave, datos)
  // Fuera del rango consultado (otro mes del calendario) manda la caché local:
  // el reporte solo cubre el período activo.
  if (!serieApi || !serieApi.desde || clave < serieApi.desde || clave > serieApi.hasta) return local
  const grupo = serieApi.porDia.get(clave)
  const ingresos = grupo ? Number(grupo.totalPyg || 0) : 0
  const costoMercaderia = grupo ? Number(grupo.costPyg || 0) : 0
  const ganancia = ingresos - costoMercaderia - local.totalGastos - local.totalAds
  const sinDatos = !grupo && local.totalGastos === 0 && local.totalAds === 0
  return {
    ...local,
    ingresos,
    costoMercaderia,
    ganancia,
    estado: sinDatos ? 'vacio' : ganancia > 0 ? 'ganancia' : ganancia < 0 ? 'perdida' : 'empate',
    cantVentas: grupo ? Number(grupo.orders || 0) : 0,
  }
}
