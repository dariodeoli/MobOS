import { useId, useState } from 'react'
import { useComboboxNavigation } from 'owncoding-ui'
import { Input } from '@/components/ui'
import { cn } from '@/lib/utils'
import { buscarPaises, paisesPredeterminados } from '@/lib/paises'
import { capitalizarPrimera } from '@/utils/texto'
import { ANCHO_CAMPO } from './anchoCampos'

// País con países predeterminados (#389): al enfocar muestra Paraguay,
// Argentina, Brasil, Uruguay, Bolivia, Chile, EE. UU. y España; al escribir
// busca en el catálogo completo (sin acentos). Combobox ARIA; el valor es el
// nombre del país (string) y el texto libre sigue permitido como en las
// direcciones históricas. Ancho de campo corto (ANCHO_CAMPO.pais).
export default function CountrySelect({
  value = '', onChange, id, disabled = false, ariaLabel = 'País',
  placeholder = 'Paraguay', maxLength = 100, className, inputProps,
}) {
  const [abierto, setAbierto] = useState(false)
  const [escribiendo, setEscribiendo] = useState(false)
  const reactId = useId()
  const opciones = escribiendo && value.trim() ? buscarPaises(value) : paisesPredeterminados()
  const visible = abierto && opciones.length > 0

  function elegir(opcion) {
    onChange?.(opcion.name)
    setEscribiendo(false)
    setAbierto(false)
  }
  const navegacion = useComboboxNavigation({
    options: opciones, open: visible, onOpenChange: setAbierto, onSelect: elegir,
    getOptionKey: (opcion) => opcion.country, listboxId: `${id || reactId}-paises`,
  })

  return (
    <div className={cn('relative w-full', ANCHO_CAMPO.pais, className)}>
      <Input
        {...inputProps}
        {...navegacion.inputProps}
        id={id}
        maxLength={maxLength}
        disabled={disabled}
        autoCapitalize="words"
        autoComplete="off"
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        onFocus={(event) => { inputProps?.onFocus?.(event); setAbierto(true) }}
        onBlur={(event) => { inputProps?.onBlur?.(event); setAbierto(false); setEscribiendo(false) }}
        onChange={(event) => { onChange?.(capitalizarPrimera(event.target.value)); setEscribiendo(true); setAbierto(true); navegacion.setActiveIndex(0) }}
      />
      {visible && (
        <ul {...navegacion.listboxProps} aria-label="Países" className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-ink-500 bg-ink shadow-float">
          {opciones.map((opcion, indice) => (
            <li
              key={opcion.country}
              {...navegacion.getOptionProps(indice)}
              className={cn('min-h-11 cursor-pointer px-3 py-2.5 text-left text-sm text-fore transition', indice === navegacion.activeIndex ? 'bg-ink-700' : 'hover:bg-ink-700')}
            >
              {opcion.name}
            </li>
          ))}
          {!escribiendo && <li aria-hidden="true" className="px-3 py-1.5 text-xs text-mute">Escribí para buscar otro país</li>}
        </ul>
      )}
    </div>
  )
}
