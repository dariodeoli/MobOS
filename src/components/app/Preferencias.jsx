import { Select } from '@/components/ui'
import { BLOQUEOS_MINUTOS } from '@/lib/preferencias'
import { activarTemaV2, useTemaV2 } from '@/lib/temaV2'

const ETIQUETA_MINUTOS = {
  1: '1 minuto',
  5: '5 minutos',
  10: '10 minutos',
  15: '15 minutos',
  30: '30 minutos',
}

// Preferencias del dispositivo (Configuración → Sistema): minutos de bloqueo por
// inactividad y aviso de novedades. Se aplican al instante y quedan guardadas.
// El tema no vive acá: está en la barra superior y en el menú (#228).
export function PreferenciasContenido({ preferencias, onCambiar }) {
  // El rediseño v2 es el diseño por defecto desde el rollout (#241); esta
  // salida opt-out es por dispositivo y se aplica al instante.
  const v2 = useTemaV2()
  return (
    <div className="space-y-5">
      <section>
        <label htmlFor="pref-bloqueo" className="text-sm font-semibold">Bloqueo por inactividad</label>
        <p className="mt-1 text-xs text-mute">La pantalla se bloquea sola después de este tiempo sin actividad.</p>
        <Select
          id="pref-bloqueo"
          className="mt-2 w-full"
          value={String(preferencias.bloqueoMinutos)}
          onChange={event => onCambiar({ bloqueoMinutos: Number(event.target.value) })}
        >
          {BLOQUEOS_MINUTOS.map(minutos => (
            <option key={minutos} value={minutos}>{ETIQUETA_MINUTOS[minutos] || `${minutos} minutos`}</option>
          ))}
        </Select>
      </section>

      <section>
        <label className="flex items-start gap-3 rounded-xl border border-ink-600 p-3">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={preferencias.notificaciones}
            onChange={event => onCambiar({ notificaciones: event.target.checked })}
          />
          <span>
            <span className="block text-sm font-semibold">Notificaciones</span>
            <span className="block text-xs text-mute">Mostrar el aviso de novedades: pedidos, aprobaciones, comentarios y menciones.</span>
          </span>
        </label>
      </section>

      {/* Opt-out del rediseño (#241): visible y reversible, solo en este
          dispositivo. El diseño anterior sigue completo por si hay que volver. */}
      <section>
        <label className="flex items-start gap-3 rounded-xl border border-ink-600 p-3">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={!v2}
            onChange={event => activarTemaV2(!event.target.checked)}
          />
          <span>
            <span className="block text-sm font-semibold">Volver al diseño anterior</span>
            <span className="block text-xs text-mute">
              Esta versión usa el rediseño. Marcá esta opción para trabajar con el diseño anterior en este
              dispositivo; podés desmarcarla para volver al rediseño cuando quieras.
            </span>
          </span>
        </label>
      </section>
    </div>
  )
}
