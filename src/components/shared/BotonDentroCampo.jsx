import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

// Acción dentro del campo (#234): botón trailing absoluto que vive adentro del
// input, al estilo del ojo de `PasswordInput`. El campo lo posiciona con
// `relative` y reserva el lugar con `pr-11` (o `pr-32` mientras `ocupado`).
// `title` + `aria-label` sostienen el tooltip y el lector de pantalla, porque
// adentro del input no hay texto visible.
export default function BotonDentroCampo({
  etiqueta,
  titulo,
  etiquetaOcupada = 'Consultando…',
  icono = 'search',
  ocupado = false,
  disabled = false,
  onClick,
  className = '',
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || ocupado}
      aria-label={ocupado ? etiquetaOcupada : etiqueta}
      aria-busy={ocupado || undefined}
      title={ocupado ? etiquetaOcupada : titulo || etiqueta}
      className={cn(
        'absolute inset-y-0 right-0 flex items-center rounded-r-lg text-mute transition hover:text-fore focus-visible:z-10',
        'disabled:cursor-not-allowed disabled:opacity-40',
        ocupado ? 'gap-2 bg-ink-700 px-3 text-xs font-semibold text-fono-light' : 'w-11 justify-center',
        className,
      )}
    >
      {ocupado ? (
        <>
          <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-500 border-t-fono-light" />
          {etiquetaOcupada}
        </>
      ) : <Icon name={icono} className="h-4 w-4" />}
    </button>
  )
}
