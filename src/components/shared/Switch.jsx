import { cn } from '@/lib/utils'

// Interruptor estilo iPhone para booleanos de formulario ("activo", "aplica
// descuento", "se acredita en días"). Por dentro es un checkbox real: conserva
// teclado, lectores de pantalla y la asociación con <label>; para listas de
// selección múltiple va el checkbox de siempre (accent-fono).
export default function Switch({ checked, onChange, disabled = false, id, ariaLabel, className, ...props }) {
  return (
    <span className={cn('relative inline-flex h-5 w-9 shrink-0 items-center', className)}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-checked={Boolean(checked)}
        aria-label={ariaLabel}
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={onChange}
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none rounded-full opacity-0 disabled:cursor-not-allowed"
        {...props}
      />
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 rounded-full border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-fono/50 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-paper',
          checked ? 'border-fono bg-fono' : 'border-ink-500 bg-ink-600',
          disabled && 'opacity-50',
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
          checked && 'translate-x-4',
        )}
      />
    </span>
  )
}
