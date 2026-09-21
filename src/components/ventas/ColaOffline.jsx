import { useColaOffline } from '@/hooks/useColaOffline'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

const hora = (ms) =>
  ms ? new Date(ms).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' }) : ''

// Indicador de la cola de ventas sin sincronizar: cuántas hay, cuándo se
// sincronizó la última y si alguna quedó en conflicto. No ocupa lugar cuando no
// hay nada pendiente (el modo online no cambia).
export default function ColaOffline() {
  const { pendientes, conflictos, ultimaSync, sincronizando, sincronizar, enLinea } = useColaOffline()
  if (!pendientes && !conflictos) return null
  const conProblema = conflictos > 0
  return (
    <div
      data-testid="cola-offline"
      role="status"
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2 text-xs',
        conProblema ? 'border-bad/40 bg-bad/10 text-bad' : 'border-warn/40 bg-warn/10 text-warn',
      )}
    >
      <span className="inline-flex items-center gap-1.5 font-semibold">
        <Icon name={conProblema ? 'alert' : 'clock'} className="h-3.5 w-3.5" />
        {pendientes > 0
          ? `${pendientes} venta${pendientes === 1 ? '' : 's'} sin sincronizar`
          : 'Sin ventas pendientes'}
      </span>
      {conflictos > 0 && (
        <span className="font-semibold">
          {conflictos} con conflicto (revisar en el listado de pedidos)
        </span>
      )}
      {ultimaSync && <span className="text-mute">Última sync {hora(ultimaSync)}</span>}
      <button
        type="button"
        onClick={sincronizar}
        disabled={sincronizando || !enLinea}
        className="rounded-lg border border-current px-2.5 py-1 font-semibold transition hover:bg-ink-700/40 disabled:opacity-50"
      >
        {sincronizando ? 'Sincronizando…' : enLinea ? 'Sincronizar ahora' : 'Sin conexión'}
      </button>
    </div>
  )
}
