import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'
import { grupoConfig } from './gruposConfig'

// #253 · Navegación interna de Configuración: los 7 grupos en un riel a la
// izquierda en escritorio —expandido o solo íconos con tooltip— y una tira
// horizontal desplazable en mobile/tablet. Mantiene `role="tab"`/`aria-selected`
// (los e2e y la accesibilidad existentes siguen funcionando) y el contenido lo
// aporta la pantalla. El orden y la visibilidad salen de `items`.

const CLAVE_COLAPSADO = 'mobos:config-nav'

function leerColapsado() {
  try { return window.localStorage.getItem(CLAVE_COLAPSADO) === '1' } catch { return false }
}

export default function NavegacionConfig({ value, onChange, items = [], children }) {
  const [colapsado, setColapsado] = useState(leerColapsado)
  const activoRef = useRef(null)
  const botonesRef = useRef({})
  const grupos = items.map(([id, label]) => ({ id, label, ...(grupoConfig(id) || {}) }))
  const activo = grupos.find((grupo) => grupo.id === value) || grupos[0]

  useEffect(() => {
    // En mobile la tira puede dejar la sección activa fuera de vista al entrar
    // por un enlace directo: la centramos sin mover la página.
    activoRef.current?.scrollIntoView?.({ inline: 'center', block: 'nearest' })
  }, [value])

  function alternarColapsado() {
    const siguiente = !colapsado
    setColapsado(siguiente)
    try { window.localStorage.setItem(CLAVE_COLAPSADO, siguiente ? '1' : '0') } catch { /* sin storage */ }
  }

  // Teclado del tablist: las flechas mueven y activan la pestaña contigua a la
  // enfocada (comportamiento estándar de un tablist).
  function alTeclado(event) {
    const teclas = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft']
    if (!teclas.includes(event.key) || !grupos.length) return
    event.preventDefault()
    const ids = grupos.map((grupo) => grupo.id)
    const enfocado = ids.findIndex((id) => botonesRef.current[id] === document.activeElement)
    const actual = enfocado >= 0 ? enfocado : ids.indexOf(value)
    const paso = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1
    const siguiente = grupos[(actual + paso + grupos.length) % grupos.length]
    onChange(siguiente.id)
    botonesRef.current[siguiente.id]?.focus()
  }

  if (!grupos.length) return null

  return (
    <div className={cn('lg:grid lg:items-start lg:gap-5', colapsado ? 'lg:grid-cols-[3.75rem_minmax(0,1fr)]' : 'lg:grid-cols-[16.5rem_minmax(0,1fr)]')}>
      <nav
        id="config-grupos"
        role="tablist"
        aria-label="Secciones de Configuración"
        data-testid="config-grupos"
        data-colapsado={colapsado ? '1' : '0'}
        onKeyDown={alTeclado}
        className="mb-3 flex gap-1.5 overflow-x-auto rounded-2xl border border-fore/10 bg-ink p-2 lg:sticky lg:top-3 lg:mb-0 lg:flex-col lg:gap-1 lg:overflow-visible"
      >
        <button
          type="button"
          data-testid="config-nav-toggle"
          onClick={alternarColapsado}
          aria-expanded={!colapsado}
          aria-controls="config-grupos"
          title={colapsado ? 'Expandir el menú' : 'Contraer el menú'}
          aria-label={colapsado ? 'Expandir el menú de Configuración' : 'Contraer el menú de Configuración'}
          className={cn(
            'hidden min-h-11 shrink-0 items-center justify-end rounded-[10px] px-2.5 text-mute transition hover:bg-ink-700/70 hover:text-fore lg:flex',
            colapsado && 'lg:justify-center lg:px-0',
          )}
        >
          <Icon name="chevron" className={cn('h-3.5 w-3.5 transition-transform', colapsado ? '-rotate-90' : 'rotate-90')} />
        </button>
        {grupos.map((grupo) => {
          const esta = grupo.id === value
          return (
            <button
              key={grupo.id}
              type="button"
              role="tab"
              aria-selected={esta}
              aria-label={grupo.label}
              title={grupo.label}
              ref={(nodo) => { botonesRef.current[grupo.id] = nodo; if (esta) activoRef.current = nodo }}
              onClick={() => onChange(grupo.id)}
              className={cn(
                'group relative flex min-h-11 shrink-0 items-center gap-2.5 rounded-[10px] border px-3 text-left text-[13px] leading-snug transition lg:w-full',
                colapsado && 'lg:justify-center lg:px-0',
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
