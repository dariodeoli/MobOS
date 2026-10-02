import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

// Barra compacta del módulo (#256 · consolidada en #320): contexto + acción
// principal + secundarias, con los filtros debajo. El título visible de la
// página es UNO solo: el `h1` del shell (topbar); esta barra NO lo repite.
// `titulo` queda como nombre accesible de la sección y `tituloVisible` existe
// solo para previews standalone que no pasan por el shell.
export default function BarraModulo({ icono, titulo, descripcion, contexto, children, className, testId = 'barra-modulo', tituloVisible = false }) {
  return (
    <section
      data-testid={testId}
      aria-label={titulo}
      className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-ink-600 pb-3', className)}
    >
      <div className="flex min-w-[11rem] flex-1 items-center gap-2.5">
        {icono && (
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-fono/10 text-fono-light">
            <Icon name={icono} className="h-[18px] w-[18px]" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {tituloVisible && <h2 className="truncate text-base font-bold tracking-tight">{titulo}</h2>}
          {descripcion && (
            <p
              className={cn('truncate text-xs text-mute', tituloVisible && 'mt-0.5 hidden sm:block')}
              title={descripcion}
            >
              {descripcion}
            </p>
          )}
        </div>
        {contexto}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{children}</div>}
    </section>
  )
}
