import { useState } from 'react'
import { listVentas, listGastos, listAds, productosById } from '@/lib/storage'
import { calcularGanancia, gs } from '@/utils/calculos'
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
  const g = calcularGanancia(periodo, {
    ventas: listVentas(),
    gastos: listGastos(),
    ads: listAds(),
    prodsById: productosById(),
  })

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
