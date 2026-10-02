import { describirDispositivo, haceCuanto } from '@/lib/dispositivoSesion'
import { fechaHora } from '@/utils/fecha'

// Fila de sesión (#300): lo primero que se lee es el dispositivo en palabras
// («Chrome en Mac · macOS»), cuándo fue la última actividad y si es la sesión
// actual. Los identificadores crudos viven en «Detalles técnicos», plegados.
// La comparten Mi cuenta (sesiones propias) y Seguridad (sesiones del equipo).
export default function SesionDispositivo({ sesion, actual = false, nivel = '', children }) {
  const { etiqueta } = describirDispositivo(sesion?.userAgent)
  const actividad = haceCuanto(sesion?.lastSeenAt)
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-ink-600 p-3" data-testid="sesion-fila">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {etiqueta}
          {actual && <span className="ml-2 text-xs font-semibold text-fono-light">Sesión actual</span>}
        </p>
        <p className="mt-1 text-xs text-mute" data-testid="sesion-actividad">
          {actividad ? `Última actividad ${actividad}` : 'Última actividad sin registro'}
          {' · '}iniciada {fechaHora(sesion?.createdAt)}
          {nivel ? ` · ${nivel}` : ''}
        </p>
        <details className="mt-1.5">
          <summary className="cursor-pointer select-none text-[10.5px] font-semibold uppercase tracking-wider text-mute transition hover:text-fore">Detalles técnicos</summary>
          <ul className="mt-1.5 space-y-0.5 text-xs text-mute">
            <li>ID del dispositivo: <span className="break-all font-mono">{sesion?.deviceId || '—'}</span></li>
            <li>ID de la sesión: <span className="break-all font-mono">{sesion?.id || '—'}</span></li>
            {sesion?.userAgent && <li>Agente: <span className="break-all font-mono">{sesion.userAgent}</span></li>}
            <li>Inicio: {fechaHora(sesion?.createdAt)} · última actividad: {fechaHora(sesion?.lastSeenAt)}</li>
          </ul>
        </details>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}
