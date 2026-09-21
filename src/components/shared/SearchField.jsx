import { forwardRef } from 'react'
import { Input } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

// Búsqueda instantánea con el formato único de la app: lupa a la izquierda,
// botón para limpiar cuando hay texto y el contrato de siempre
// (value/onChange, placeholder, aria-label, ref). El campo no retrasa lo que se
// escribe: si una pantalla consulta a la API, el debounce vive en la pantalla.
// Limpiar llama a onClear si existe; si no, emite el cambio con valor vacío.
const SearchField = forwardRef(function SearchField({ value = '', onChange, onClear, placeholder, ariaLabel, className, disabled = false, ...props }, ref) {
  function limpiar() {
    if (onClear) onClear()
    else onChange?.({ target: { value: '' } })
  }
  return (
    <div className={cn('relative min-w-0', className)}>
      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" aria-hidden="true" />
      <Input
        ref={ref}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        disabled={disabled}
        className="pl-9 pr-9"
        {...props}
      />
      {value ? (
        <button
          type="button"
          onClick={limpiar}
          disabled={disabled}
          className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-mute transition hover:bg-ink-700 hover:text-fore disabled:opacity-40"
          aria-label="Limpiar búsqueda"
          title="Limpiar búsqueda"
        >
          <Icon name="close" className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  )
})

export default SearchField
