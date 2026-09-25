import { useEffect, useRef } from 'react'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'
import { grupoConfig } from './gruposConfig'

// #253 · Navegación interna de Configuración: los 7 grupos en un riel a la
// izquierda en escritorio y una tira desplazable con iconos en mobile, más la
// descripción del grupo activo. Mantiene `role="tab"`/`aria-selected` (los e2e
// y la accesibilidad existentes siguen funcionando) y el contenido lo aporta
// la pantalla. El orden y la visibilidad salen de `items`.
export default function NavegacionConfig({ value, onChange, items = [], children }) {
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
    <div className="lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:items-start lg:gap-5">
      <nav
        role="tablist"
        aria-label="Secciones de Configuración"
        data-testid="config-grupos"
        className="mb-3 flex gap-1.5 overflow-x-auto rounded-2xl border border-fore/10 bg-ink p-2 lg:sticky lg:top-3 lg:mb-0 lg:flex-col lg:gap-0.5 lg:overflow-visible"
      >
        {grupos.map((grupo) => {
          const esta = grupo.id === value
          return (
            <button
              key={grupo.id}
              type="button"
              role="tab"
              aria-selected={esta}
              ref={esta ? activoRef : undefined}
              onClick={() => onChange(grupo.id)}
              className={cn(
                'group relative flex min-h-11 shrink-0 items-center gap-2 rounded-[10px] border px-3 text-left text-[13px] leading-snug transition lg:w-full',
                esta
                  ? 'border-fono/30 bg-gradient-to-r from-fono/[.16] to-fono/[.05] font-semibold text-fore'
                  : 'border-transparent text-mute hover:bg-ink-700/70 hover:text-fore',
              )}
            >
              {esta && <span aria-hidden className="absolute left-0 top-1/2 hidden h-5 w-[2px] -translate-y-1/2 rounded-full bg-fono lg:block" />}
              <Icon name={grupo.icono} className={cn('h-4 w-4 shrink-0', esta ? 'text-fono-light' : 'group-hover:text-fore')} />
              <span className="truncate">{grupo.label}</span>
            </button>
          )
        })}
      </nav>

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
