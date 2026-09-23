import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

// Opciones excluyentes en una barra segmentada (mismo lenguaje que el
// selector lista/cuadrícula): 2 a 5 opciones cortas, con ícono y contador
// opcionales. `options` usa la convención del repo: [id, etiqueta, icono?,
// contador?].
export default function SegmentedField({ value, onChange, options = [], ariaLabel, className }) {
  if (!options.length) return null
  return (
    <div className={cn('flex flex-wrap gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1', className)} role="group" aria-label={ariaLabel}>
      {options.map(([id, label, icon, contador]) => {
        const activo = value === id
        return (
          <button
            key={id}
            type="button"
            aria-pressed={activo}
            aria-label={contador === undefined ? label : `${label} (${contador})`}
            title={label}
            onClick={() => onChange(id)}
            className={cn(
              'inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition',
              activo ? 'bg-fono/15 text-fono-light' : 'text-mute hover:bg-fore/5 hover:text-fore',
            )}
          >
            {icon && <Icon name={icon} className="h-4 w-4 shrink-0" />}
            <span className="min-w-0 truncate">{label}</span>
            {contador !== undefined && <span className="text-xs opacity-75">{contador}</span>}
          </button>
        )
      })}
    </div>
  )
}
