import { cn } from '@/lib/utils'

const TONOS = {
  default: 'text-fore',
  ok: 'text-ok',
  warn: 'text-warn',
  bad: 'text-bad',
  info: 'text-info',
}

// Resumen compacto para métricas con alcances explícitos. `detail` no es
// decorativo: evita mezclar totales del tenant con filas cargadas o filtradas.
export default function MetricStrip({ items = [], ariaLabel = 'Resumen', className, ...props }) {
  return (
    <dl
      aria-label={ariaLabel}
      className={cn(
        'grid min-w-0 grid-cols-2 gap-px overflow-hidden rounded-xl border border-ink-600 bg-ink-600 sm:grid-cols-3 xl:grid-cols-6',
        className,
      )}
      {...props}
    >
      {items.map(item => (
        <div key={item.key || item.label} className="min-w-0 bg-ink-800/90 px-3 py-2.5">
          <dt className="text-[11px] font-semibold uppercase leading-4 tracking-wider text-mute">
            {item.label}
          </dt>
          <dd
            className={cn(
              'v2-numero mt-0.5 min-w-0 break-words text-lg font-semibold leading-6 tabular-nums sm:text-xl',
              TONOS[item.tone] || TONOS.default,
              item.valueClassName,
            )}
          >
            {item.value}
          </dd>
          {item.detail && <dd className="mt-0.5 text-[11px] leading-4 text-mute">{item.detail}</dd>}
        </div>
      ))}
    </dl>
  )
}
