import Icon from '@/components/shared/Icon'
import { Button } from '@/components/ui'
import { aplicarVersionNueva } from '@/lib/actualizacion'
import { useVersionNueva } from '@/hooks/useVersionNueva'

// Aviso de versión nueva del shell (#214): la app abierta no se actualiza sola,
// así que se ofrece recargar de forma controlada. Queda debajo del bloqueo de
// pantalla (z-[60] < z-[70]) para no tapar el PIN.
export default function AvisoVersion() {
  const { disponible, descartar } = useVersionNueva()
  if (!disponible) return null
  return (
    <div
      role="status"
      data-testid="aviso-version"
      className="fixed inset-x-0 bottom-4 z-[60] mx-auto flex w-[min(92vw,26rem)] items-center gap-3 rounded-2xl border border-fono/40 bg-ink p-3 shadow-2xl"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-fono/15 text-fono-light">
        <Icon name="refresh" className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Hay una versión nueva</p>
        <p className="text-[11px] text-mute">Recargá para actualizar. No se pierde nada.</p>
      </div>
      <Button type="button" className="shrink-0" onClick={aplicarVersionNueva}>Recargar</Button>
      <button
        type="button"
        onClick={descartar}
        aria-label="Después"
        title="Después"
        className="shrink-0 rounded-lg p-1.5 text-mute transition hover:bg-ink-700 hover:text-fore"
      >
        <Icon name="close" className="h-4 w-4" />
      </button>
    </div>
  )
}
