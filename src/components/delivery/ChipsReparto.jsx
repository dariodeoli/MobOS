import { cn } from '@/lib/utils'

// Chips de filtro del reparto (misma pieza para tienda y repartidor).
export function ChipsReparto({ value, onChange, items, flat = false }) {
  return (
    <div
      className={
        flat
          ? 'entregas-f3-chips'
          : 'flex flex-wrap gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1'
      }
    >
      {items.map(([id, label]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={
            flat
              ? 'transition'
              : cn(
                  'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                  value === id ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore',
                )
          }
        >
          {label}
        </button>
      ))}
    </div>
  )
}
