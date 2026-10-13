import { ActionToolbar } from 'owncoding-ui'
import { cn } from '@/lib/utils'

// Barra de herramientas de una pestaña (docs/PANTALLAS.md regla 7). Envuelve el
// `ActionToolbar` de owncoding-ui y ordena sus huecos: búsqueda · filtros ·
// vista (L2 segmentado) · [hijos libres] · Más + acción principal a la derecha.
// Un hueco vacío no deja contenedor. `lead` es la identidad compacta que aún
// usa `BarraModulo`. `plano` quita caja y fondo (barra embebida en otra caja).
// `searchClassName` ajusta el ancho del hueco de búsqueda (placeholder largo).
export default function Toolbar({ label = 'Herramientas', search, filters, view, primary, more, lead, children, plano = false, className, searchClassName, testId = 'toolbar' }) {
  const derecha = more || primary
  return (
    <div data-testid={testId} className="min-w-0">
      <ActionToolbar
        label={label}
        className={cn(
          'gap-x-3 gap-y-2',
          plano && 'rounded-none border-0 bg-transparent p-0',
          className,
        )}
      >
        {lead}
        {search && <div data-slot="search" className={cn('min-w-0 basis-full sm:min-w-[14rem] sm:flex-1 sm:basis-64', searchClassName)}>{search}</div>}
        {filters && <div data-slot="filters" className="flex min-w-0 flex-wrap items-center gap-2">{filters}</div>}
        {view && <div data-slot="view" className="flex min-w-0 items-center">{view}</div>}
        {children}
        {derecha && (
          <div data-slot="actions" className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
            {more}
            {primary}
          </div>
        )}
      </ActionToolbar>
    </div>
  )
}
