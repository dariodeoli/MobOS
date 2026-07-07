import { useState } from 'react'
import { listVentas, listGastos, listAds, productosById } from '@/lib/storage'
import { calcularGanancia, calcularGananciaDia, fechaClave, gs } from '@/utils/calculos'
import { Card, Badge } from '@/components/ui'

const PERIODOS = [
  ['dia', 'Día'],
  ['semana', 'Semana'],
  ['mes', 'Mes'],
  ['anio', 'Año'],
]

export function PeriodoTabs({ periodo, setPeriodo }) {
  return (
    <div className="flex gap-1 bg-slate-200 p-1 rounded-xl">
      {PERIODOS.map(([k, label]) => (
        <button
          key={k}
          onClick={() => setPeriodo(k)}
          className={
            'flex-1 rounded-lg py-2 text-sm font-bold transition ' +
            (periodo === k ? 'bg-white text-fono shadow-sm' : 'text-slate-500')
          }
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export default function Ganancias() {
  const [periodo, setPeriodo] = useState('dia')
  const datos = {
    ventas: listVentas(),
    gastos: listGastos(),
    ads: listAds(),
    prodsById: productosById(),
  }
  const g = calcularGanancia(periodo, datos)

  const positivo = g.estado === 'ganancia'
  const negativo = g.estado === 'perdida'

  return (
    <div className="space-y-4">
      <PeriodoTabs periodo={periodo} setPeriodo={setPeriodo} />

      {/* Resultado grande */}
      <Card
        className={
          positivo
            ? 'bg-emerald-50 border-emerald-300'
            : negativo
              ? 'bg-red-50 border-red-300'
              : 'bg-white'
        }
      >
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
          {positivo ? '🟢 Ganancia' : negativo ? '🔴 Pérdida' : '🟡 Empate'} del período
        </div>
        <div
          className={
            'text-4xl font-extrabold mt-1 tracking-tight ' +
            (positivo ? 'text-emerald-600' : negativo ? 'text-red-600' : 'text-slate-700')
          }
        >
          {gs(g.ganancia)}
        </div>
        <div className="text-sm text-slate-500 mt-1">{g.cantVentas} ventas en el período</div>
      </Card>

      {/* Calendario de resultados por día */}
      <CalendarioGanancias datos={datos} />

      {/* Desglose */}
      <Card>
        <h3 className="font-bold mb-3">🧮 Cómo se calcula</h3>
        <div className="space-y-2 text-sm">
          <Linea label="💵 Ingresos por ventas" valor={g.ingresos} signo="+" color="text-emerald-600" />
          <Linea label="📦 Costo de mercadería vendida" valor={g.costoMercaderia} signo="−" color="text-slate-600" />
          <Linea label="🧾 Gastos" valor={g.totalGastos} signo="−" color="text-slate-600" />
          <Linea label="📣 Meta Ads" valor={g.totalAds} signo="−" color="text-slate-600" />
          <div className="border-t border-slate-200 pt-2 flex items-center justify-between font-extrabold">
            <span>{positivo ? '🟢' : negativo ? '🔴' : '🟡'} Resultado</span>
            <span className={positivo ? 'text-emerald-600' : negativo ? 'text-red-600' : 'text-slate-700'}>
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
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const DIAS_SEMANA = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']

const ESTILO_DIA = {
  ganancia: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  perdida: 'bg-red-100 text-red-700 border-red-300',
  empate: 'bg-amber-100 text-amber-700 border-amber-300',
  vacio: 'bg-white text-slate-300 border-slate-100',
}

function CalendarioGanancias({ datos }) {
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
    celdas.push({ d, clave, ...calcularGananciaDia(clave, datos) })
  }

  const irMes = (delta) => {
    setSel(null)
    setCursor(new Date(anio, mes + delta, 1))
  }

  const detalle = sel ? calcularGananciaDia(sel, datos) : null

  return (
    <Card>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Calendario compacto */}
        <div className="w-full max-w-[300px] shrink-0">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => irMes(-1)}
              className="h-7 w-7 rounded-lg text-slate-500 hover:bg-slate-100 font-bold"
              aria-label="Mes anterior"
            >
              ‹
            </button>
            <span className="text-sm font-bold text-slate-700">
              {MESES[mes]} {anio}
            </span>
            <button
              onClick={() => irMes(1)}
              className="h-7 w-7 rounded-lg text-slate-500 hover:bg-slate-100 font-bold"
              aria-label="Mes siguiente"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-0.5">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="text-center text-[10px] font-bold text-slate-400">
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
                    (c.clave === sel ? ' ring-2 ring-slate-700' : '')
                  }
                >
                  {c.d}
                </button>
              ),
            )}
          </div>

          {/* Leyenda */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-slate-500">
            <Leyenda color="bg-emerald-300" label="Ganancia" />
            <Leyenda color="bg-red-300" label="Pérdida" />
            <Leyenda color="bg-amber-300" label="Empate" />
            <Leyenda color="bg-slate-200" label="Sin ventas" />
          </div>
        </div>

        {/* Historial del día seleccionado */}
        <div className="flex-1 lg:border-l lg:border-slate-200 lg:pl-4">
          {detalle ? (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700">
                  {detalle.estado === 'ganancia'
                    ? '🟢 Ganancia'
                    : detalle.estado === 'perdida'
                      ? '🔴 Pérdida'
                      : detalle.estado === 'empate'
                        ? '🟡 Empate'
                        : '⚪ Sin movimiento'}{' '}
                  · {sel}
                </span>
                <span
                  className={
                    'font-extrabold ' +
                    (detalle.estado === 'ganancia'
                      ? 'text-emerald-600'
                      : detalle.estado === 'perdida'
                        ? 'text-red-600'
                        : 'text-slate-700')
                  }
                >
                  {gs(detalle.ganancia)}
                </span>
              </div>
              <div className="space-y-1.5 text-sm mt-3">
                <Linea label="💵 Ingresos por ventas" valor={detalle.ingresos} signo="+" color="text-emerald-600" />
                <Linea label="📦 Costo de mercadería" valor={detalle.costoMercaderia} signo="−" color="text-slate-600" />
                <Linea label="🧾 Gastos" valor={detalle.totalGastos} signo="−" color="text-slate-600" />
                <Linea label="📣 Meta Ads" valor={detalle.totalAds} signo="−" color="text-slate-600" />
              </div>
              <div className="text-xs text-slate-500 mt-2">{detalle.cantVentas} ventas en el día</div>
            </div>
          ) : (
            <div className="text-sm text-slate-400 py-2">
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
      <span className="text-slate-600">{label}</span>
      <span className={'font-bold ' + color}>
        {signo} {gs(valor)}
      </span>
    </div>
  )
}
