import { Select } from '@/components/ui'
import { estadoInfo } from '@/lib/estados'
import { cn } from '@/lib/utils'
import { CLASES_TONO } from './StatusChip'

// Estado EDITABLE con forma de chip (docs/PANTALLAS.md regla 10): un único
// control que muestra el estado actual con su tono y deja cambiarlo; no hay
// chip de solo lectura al lado de un select. Lee `lib/estados.js` como el
// `StatusChip` y usa el `Select` compartido (teclado, lectores, chevron):
// ≥ 44px de alto bajo lg y 32px en escritorio.
export default function EstadoSelect({ value, opciones, dominio = 'general', onChange, disabled, ariaLabel, className, testId }) {
  const actual = estadoInfo(value, dominio)
  return (
    <Select
      data-testid={testId}
      data-tono={actual.tono}
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={onChange}
      className={cn('w-full min-w-0 max-w-full h-11 md:h-11 lg:h-8 !pl-2 !pr-8 text-xs font-semibold md:text-xs', CLASES_TONO[actual.tono], className)}
    >
      {opciones.map((clave) => (
        <option key={clave} value={clave}>{estadoInfo(clave, dominio).label}</option>
      ))}
    </Select>
  )
}
