import { useState } from 'react'
import { gs } from '@/utils/calculos'
import { cn } from '@/lib/utils'
import { rutaSector } from './datos.js'
import './graficos.css'

const COLORES = ['var(--g-1)', 'var(--g-2)', 'var(--g-3)', 'var(--g-4)', 'var(--g-5)', 'var(--g-6)']
const TAM = 168
const R_EXT = 78
const R_INT = 52

// Dona para repartos (mix de medios de pago). Al centro: el porcentaje y el
// nombre del tramo activo (pasar el mouse o usar ← →). A un costado la leyenda
// con nombre, importe completo y porcentaje, que también sirve de lectura sin
// color. Hasta 5 tramos; el resto se agrupa en «Otros».
export default function GraficoDona({ items = [], etiqueta, formato = gs, maxTramos = 5, className }) {
  const [activo, setActivo] = useState(null)
  const positivos = items.filter((i) => i.valor > 0).sort((a, b) => b.valor - a.valor)
  if (!positivos.length) return null
  const visibles = positivos.slice(0, maxTramos)
  const resto = positivos.slice(maxTramos).reduce((s, i) => s + i.valor, 0)
  if (resto > 0) visibles.push({ clave: 'otros', etiqueta: 'Otros', valor: resto })
  const total = visibles.reduce((s, i) => s + i.valor, 0)
  let acumulado = 0
  const tramos = visibles.map((item, i) => {
    const a0 = (acumulado / total) * Math.PI * 2
    acumulado += item.valor
    const a1 = (acumulado / total) * Math.PI * 2
    return { ...item, pct: (item.valor / total) * 100, color: COLORES[i % COLORES.length], d: rutaSector(TAM / 2, TAM / 2, R_EXT, R_INT, a0, a1) }
  })
  const foco = tramos[activo ?? 0]
  const pctTexto = (p) => `${p.toFixed(p >= 10 || p === 0 ? 0 : 1).replace('.', ',')}%`
  const resumen = `${etiqueta || 'Reparto'}: ${tramos.map((t) => `${t.etiqueta} ${formato(t.valor)} (${pctTexto(t.pct)})`).join(', ')}. Total ${formato(total)}.`
  const onTeclado = (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape'].includes(e.key)) return
    e.preventDefault()
    if (e.key === 'Escape') return setActivo(null)
    const paso = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1
    setActivo((i) => (((i ?? (paso > 0 ? -1 : 0)) + paso + tramos.length) % tramos.length))
  }

  return (
    <figure className={cn('m-0 flex min-w-0 flex-col items-center gap-4 sm:flex-row sm:items-center', className)} data-testid="grafico-dona">
      <div
        role="img"
        aria-label={resumen}
        tabIndex={0}
        className="graf-foco relative shrink-0"
        style={{ width: TAM, height: TAM }}
        onKeyDown={onTeclado}
        onFocus={() => setActivo((i) => i ?? 0)}
        onBlur={() => setActivo(null)}
        onPointerLeave={() => setActivo(null)}
      >
        <svg width={TAM} height={TAM} viewBox={`0 0 ${TAM} ${TAM}`} aria-hidden="true" focusable="false" style={{ display: 'block' }}>
          {tramos.map((t, i) => (
            <path
              key={t.clave ?? t.etiqueta}
              d={t.d}
              fill={t.color}
              stroke="rgb(var(--c-ink))"
              strokeWidth="2"
              opacity={activo === null || activo === i ? 1 : 0.45}
              className="graf-entra-sector"
              onPointerEnter={() => setActivo(i)}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center" aria-hidden="true">
          <span className="text-xl font-semibold leading-6 tabular-nums text-fore">{pctTexto(foco.pct)}</span>
          <span className="max-w-full truncate text-xs leading-4 text-mute">{foco.etiqueta}</span>
        </div>
      </div>
      <ul className="m-0 flex w-full min-w-0 list-none flex-col gap-2 p-0" aria-label={`Detalle de ${(etiqueta || 'reparto').toLowerCase()}`}>
        {tramos.map((t, i) => (
          <li key={t.clave ?? t.etiqueta} className={cn('flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm', activo === i && 'font-medium')}>
            <i className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: t.color }} aria-hidden="true" />
            <span className="min-w-[6.5rem] flex-1 truncate text-fore" title={t.etiqueta}>{t.etiqueta}</span>
            <span className="shrink-0 text-xs tabular-nums text-mute">{pctTexto(t.pct)}</span>
            <span className="shrink-0 font-semibold tabular-nums text-fore">{formato(t.valor)}</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}
