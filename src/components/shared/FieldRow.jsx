import { Label } from '@/components/ui'
import { cn } from '@/lib/utils'

// Campo compuesto en UNA fila con UN borde (docs/PANTALLAS.md regla 9 ·
// docs/CAMPOS.md): `prefijo` (código de país, «Gs.») + input + `final` (botón
// de acción) comparten la caja; la etiqueta va arriba y la fila mide 44px.
// El input hijo se pasa sin borde propio: la caja pinta el borde, el foco y el
// error. Máximo 640px en escritorio (lo resuelve `className` del contenedor).
export default function FieldRow({ label, htmlFor, prefijo, final, hint, error, children, className, testId }) {
  const idAyuda = htmlFor ? `${htmlFor}-ayuda` : undefined
  return (
    <div data-testid={testId} className={cn('w-full min-w-0 max-w-[640px]', className)}>
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      <div
        data-slot="fieldrow"
        data-error={error ? 'true' : undefined}
        className={cn(
          'flex min-h-11 w-full min-w-0 items-stretch overflow-hidden rounded-lg border bg-ink transition-colors',
          error ? 'border-bad' : 'border-ink-500 focus-within:border-fono',
          'focus-within:ring-2 focus-within:ring-fono/30',
        )}
      >
        {prefijo && (
          <div data-slot="prefijo" className="flex shrink-0 items-center border-r border-ink-500 bg-ink-800 px-3 text-sm text-mute">{prefijo}</div>
        )}
        <div
          data-slot="control"
          className="flex min-w-0 flex-1 items-center [&_input]:h-full [&_input]:min-h-11 [&_input]:w-full [&_input]:min-w-0 [&_input]:rounded-none [&_input]:border-0 [&_input]:bg-transparent [&_input]:shadow-none [&_input]:outline-none [&_input]:ring-0 [&_input]:focus:ring-0 [&_input]:focus-visible:ring-0"
        >
          {children}
        </div>
        {final && (
          <div data-slot="final" className="flex shrink-0 items-stretch border-l border-ink-500 [&_button]:min-h-11 [&_button]:min-w-11 [&_button]:rounded-none [&_button]:border-0">{final}</div>
        )}
      </div>
      {error ? (
        <p id={idAyuda} role="alert" className="mt-1 text-xs text-bad-text">{error}</p>
      ) : hint ? (
        <p id={idAyuda} className="mt-1 text-xs text-mute">{hint}</p>
      ) : null}
    </div>
  )
}
