import { useEffect, useRef } from 'react'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'
import { useMenuConfigColapsado } from '@/lib/menuConfig'
import { grupoConfig } from './gruposConfig'

// #253 · Navegación interna de Configuración: los 7 grupos en un riel a la
// izquierda en escritorio y una tira desplazable en mobile, más la descripción
// del grupo activo. Mantiene `role="tab"`/`aria-selected` (los e2e y la
// accesibilidad existentes siguen funcionando) y el contenido lo aporta la
// pantalla. El orden y la visibilidad salen de `items`.
// #267: en escritorio el riel se colapsa a solo iconos (tooltip + aria-label,
// `aria-current` en el activo) y la preferencia se recuerda por dispositivo;
// en mobile siempre es horizontal. Los deep links no cambian: el riel sigue
// leyendo `value`/`onChange`.
export default function NavegacionConfig({ value, onChange, items = [], children }) {
  const [colapsado, setColapsado] = useMenuConfigColapsado()
  const activoRef = useRef(null)
  const grupos = items.map(([id, label]) => ({ id, label, ...(grupoConfig(id) || {}) }))
  const activo = grupos.find((grupo) => grupo.id === value) || grupos[0]

  useEffect(() => {
    // En mobile la tira puede dejar la sección activa fuera de vista al entrar
    // por un enlace directo: la centramos sin mover la página.
    activoRef.current?.scrollIntoView?.({ inline: 'center', block: 'nearest' })
  }, [value])



  if (!grupos.length) return null

  return (
    <div className={cn('lg:grid lg:items-start lg:gap-5', colapsado ? 'lg:grid-cols-[4.75rem_minmax(0,1fr)]' : 'lg:grid-cols-[16.5rem_minmax(0,1fr)]')}>
      <div className="lg:sticky lg:top-3">
        <div className={cn('mb-1.5 hidden lg:flex', colapsado ? 'lg:justify-center' : 'lg:justify-end')}>
          <button
            type="button"
            data-testid="config-grupos-toggle"
            onClick={() => setColapsado(!colapsado)}
            aria-expanded={!colapsado}
            aria-controls="config-grupos"
            title={colapsado ? 'Expandir el menú de Configuración' : 'Colapsar el menú de Configuración'}
            aria-label={colapsado ? 'Expandir el menú de Configuración' : 'Colapsar el menú de Configuración'}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-mute transition hover:bg-ink-700 hover:text-fore"
          >
            <Icon name="chevron" className={cn('h-4 w-4 transition-transform', colapsado ? '-rotate-90' : 'rotate-90')} />
          </button>
        </div>
        <nav
          id="config-grupos"
          role="tablist"
          aria-label="Secciones de Configuración"
          data-testid="config-grupos"
          className={cn(
            'mb-3 flex gap-1.5 overflow-x-auto rounded-2xl border border-fore/10 bg-ink p-2 lg:mb-0 lg:flex-col lg:gap-0.5 lg:overflow-visible',
            colapsado && 'lg:items-center lg:p-1.5',
          )}
        >
          {grupos.map((grupo) => {
            const esta = grupo.id === value
            return (
              <button
                key={grupo.id}
                type="button"
                role="tab"
                aria-selected={esta}
                aria-current={esta ? 'page' : undefined}
                aria-label={grupo.label}
                title={grupo.label}
                ref={esta ? activoRef : undefined}
                onClick={() => onChange(grupo.id)}
                className={cn(
                  'group relative flex min-h-11 shrink-0 items-center gap-2 rounded-[10px] border px-3 text-left text-[13px] leading-snug transition',
                  colapsado ? 'lg:w-12 lg:justify-center lg:px-0' : 'lg:w-full',
                  esta
                    ? 'border-fono/30 bg-gradient-to-r from-fono/[.16] to-fono/[.05] font-semibold text-fore'
                    : 'border-transparent text-mute hover:bg-ink-700/70 hover:text-fore',
                )}
              >
                {esta && <span aria-hidden className="absolute left-0 top-1/2 hidden h-5 w-[2px] -translate-y-1/2 rounded-full bg-fono lg:block" />}
                <Icon name={grupo.icono} className={cn('h-4 w-4 shrink-0', esta ? 'text-fono-light' : 'group-hover:text-fore')} />
                <span className={cn('truncate', colapsado && 'lg:hidden')}>{grupo.label}</span>
              </button>
            )
          })}
        </nav>
      </div>

      <div className="min-w-0 space-y-3">
        {activo?.descripcion && (
          <p data-testid="config-grupo-descripcion" className="flex items-start gap-2 px-0.5 text-sm text-mute">
            <Icon name={activo.icono} className="mt-0.5 h-4 w-4 shrink-0 text-fono-light" />
            <span>{activo.descripcion}</span>
          </p>
        )}
        {children}
      </div>
    </div>
  )
}
