import Icon from '@/components/shared/Icon'
import { usePantallaAngosta } from '@/hooks/usePantallaAngosta'
import { grupoConfig } from './gruposConfig'
import './configTouch.css'

// Configuración (#410): desde lg el menú de secciones vive en la segunda
// columna del shell (MenuConfiguracion), así que acá solo queda el contenido
// en una columna de lectura. Debajo de lg las secciones son una lista con
// íconos (pantalla propia) y cada sección abre su pantalla con «‹» para volver
// (el botón lo pone el encabezado del shell). Conserva el testid
// `config-grupos` y el nombre accesible de la lista.
export default function NavegacionConfig({ value, onChange, items = [], seccionAbierta = true, children }) {
  const angosta = usePantallaAngosta()
  const group = grupoConfig(value)

  if (angosta && !seccionAbierta) {
    return (
      <div data-testid="config-pagina" className="config-pagina">
        <nav aria-label="Secciones de Configuración" data-testid="config-grupos" data-lista-movil className="flex flex-col divide-y divide-ink-600 overflow-hidden rounded-xl border border-ink-600">
          {items.map(([id, label]) => (
            <button
              key={id}
              type="button"
              data-tab-id={id}
              aria-label={label}
              onClick={() => onChange(id)}
              className="flex min-h-14 w-full items-center gap-3 px-3 text-left hover:bg-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono"
            >
              <Icon name={grupoConfig(id)?.icono || 'settings'} className="h-5 w-5 shrink-0 text-mute" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fore">{label}</span>
                {grupoConfig(id)?.descripcion && (
                  <span className="block truncate text-xs text-mute">{grupoConfig(id).descripcion}</span>
                )}
              </span>
              <Icon name="chevron" className="h-4 w-4 shrink-0 -rotate-90 text-mute" />
            </button>
          ))}
        </nav>
      </div>
    )
  }

  return (
    <div data-testid="config-pagina" className="config-pagina mx-auto w-full max-w-[960px]">
      <div className="min-w-0">
        {group?.descripcion && (
          <p data-testid="config-grupo-descripcion" className="mb-4 text-sm text-mute">
            {group.descripcion}
          </p>
        )}
        {children}
      </div>
    </div>
  )
}
