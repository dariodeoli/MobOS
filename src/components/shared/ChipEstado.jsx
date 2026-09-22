import Icon from '@/components/shared/Icon'
import { TONOS_CHIP, estadoChip } from '@/lib/estadoEquipo'
import { cn } from '@/lib/utils'

// Chip de estado del equipo (#241): certificado / en revisión / pendiente / con
// fallas. El estado, el ícono y el tono salen de `lib/estadoEquipo.js`; el
// `pass` usa el verde de certificado del tema consola.
export default function ChipEstado({ estado = 'pendiente', etiqueta, icono, className }) {
  const config = estadoChip(estado)
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[11px] font-semibold', TONOS_CHIP[config.tono], className)}>
      <Icon name={icono || config.icono} className="h-3 w-3" aria-hidden="true" />
      {etiqueta || config.etiqueta}
    </span>
  )
}
