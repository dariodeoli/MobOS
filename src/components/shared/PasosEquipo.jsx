import { cn } from '@/lib/utils'
import { ETIQUETA_RACK, ORDEN_RACK } from '@/lib/tallerRack'

// Stepper compacto del flujo de una unidad (por verificar → verificado →
// listo): marca el paso actual y deja el nombre a la vista. Lo comparten el
// rack del taller (#240) y el tablero ops (#241).
export default function PasosEquipo({ estado, testId = 'pasos-equipo', className }) {
  const indice = Math.max(0, ORDEN_RACK.indexOf(estado))
  return (
    <span
      className={cn('flex items-center gap-1', className)}
      data-testid={testId}
      data-paso={indice + 1}
      aria-label={`Paso ${indice + 1} de ${ORDEN_RACK.length}: ${ETIQUETA_RACK[estado] || estado}`}
    >
      {ORDEN_RACK.map((paso, orden) => (
        <span
          key={paso}
          aria-hidden="true"
          className={cn(
            'h-1.5 rounded-full transition-all',
            orden < indice ? 'w-3 bg-fono/60' : orden === indice ? 'w-5 bg-fono' : 'w-1.5 bg-ink-600',
          )}
        />
      ))}
      <span className="text-[10px] font-semibold text-mute">{ETIQUETA_RACK[estado] || estado}</span>
    </span>
  )
}
