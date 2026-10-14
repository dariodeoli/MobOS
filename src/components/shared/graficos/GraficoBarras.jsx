import { gs } from '@/utils/calculos'
import { cn } from '@/lib/utils'
import './graficos.css'

const COLORES = ['var(--g-1)', 'var(--g-2)', 'var(--g-3)', 'var(--g-4)', 'var(--g-5)', 'var(--g-6)']

// Barras horizontales para rankings (productos, categorías, medios, vendedores).
// Cada fila lleva el nombre, el importe COMPLETO y la barra relativa al mayor;
// las barras son decorativas porque el texto de cada fila ya dice todo, de modo
// que la lista es su propia alternativa accesible.
export default function GraficoBarras({ items = [], etiqueta, formato = gs, unico = false, className, testId = 'grafico-barras', testIdItem }) {
  if (!items.length) return null
  const max = Math.max(...items.map((i) => i.valor), 1)
  const MALO = 'var(--g-5)'
  return (
    <ul aria-label={etiqueta} data-testid={testId} className={cn('m-0 flex list-none flex-col gap-3 p-0', className)}>
      {items.map((item, i) => {
        const pct = item.valor > 0 ? Math.max((item.valor / max) * 100, 2) : 0
        return (
          <li key={item.clave ?? item.etiqueta} className="min-w-0" data-testid={testIdItem}>
            <div className="flex items-baseline gap-2">
              <span className="w-4 shrink-0 text-right text-xs tabular-nums text-mute">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-fore" title={item.etiqueta}>{item.etiqueta}</span>
              {item.extra}
              <span className={cn('shrink-0 text-sm font-semibold tabular-nums', item.valor < 0 ? 'text-bad-text' : 'text-fore')}>{formato(item.valor)}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 pl-6">
              <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-ink-700" aria-hidden="true">
                <div className="graf-entra-barra h-full rounded-full" style={{ width: `${pct}%`, background: item.valor < 0 ? MALO : unico ? COLORES[0] : COLORES[i % COLORES.length] }} />
              </div>
              {item.sub && item.sub.length <= 14 && <span className="shrink-0 text-xs tabular-nums text-mute">{item.sub}</span>}
            </div>
            {item.sub && item.sub.length > 14 && <p className="m-0 mt-0.5 pl-6 text-xs tabular-nums text-mute">{item.sub}</p>}
          </li>
        )
      })}
    </ul>
  )
}
