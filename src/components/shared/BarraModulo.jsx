import Icon from '@/components/shared/Icon'
import Toolbar from '@/components/shared/Toolbar'
import { cn } from '@/lib/utils'

// Barra compacta del módulo (#256 · consolidada en #320 · agrupada en #305):
// contexto + acción principal + secundarias, con los filtros en la misma barra.
// Desde el rediseño es un shim sobre `shared/Toolbar` (docs/PANTALLAS.md): las
// pantallas conservan sus props y testids (`barra-inventario`, `barra-pos`…) y
// migran a `Toolbar` con huecos (search/filters/view/primary/more) por tab.
// El título visible de la página es UNO solo: el `h1` del shell (topbar); esta
// barra NO lo repite. `titulo` queda como nombre accesible de la sección y
// `segmentos` (segundo nivel de Precios) ocupa el hueco inicial en lugar de la identidad: la
// sub-navegación no se mueve entre vistas. `tituloVisible` existe solo para previews standalone que no pasan por el
// shell. `expandir` da el modo agrupado de #305 (identidad compacta + controles
// y acciones en la misma fila).
export default function BarraModulo({ icono, titulo, descripcion, contexto, children, className, testId = 'barra-modulo', tituloVisible = false, expandir = false, segmentos }) {
  const identidad = (
    <div className={cn('items-center gap-2.5', !contexto && 'hidden sm:flex', contexto && 'flex', expandir ? 'min-w-0 sm:min-w-[11rem] max-w-[14rem] shrink' : 'min-w-0 sm:min-w-[11rem] flex-1')}>
      {icono && (
        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-fono/10 text-fono-light">
          <Icon name={icono} className="h-[18px] w-[18px]" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        {tituloVisible && <h2 className="truncate text-base font-bold tracking-tight">{titulo}</h2>}
        {descripcion && (
          <p
            className={cn('truncate text-xs text-mute', tituloVisible && 'mt-0.5', 'hidden sm:block')}
            title={descripcion}
          >
            {descripcion}
          </p>
        )}
      </div>
      {contexto}
    </div>
  )
  return (
    <section
      data-testid={testId}
      aria-label={titulo}
      className={cn('min-w-0 border-b border-ink-600 pb-3', className)}
    >
      <Toolbar plano label={`Acciones de ${titulo || 'la sección'}`} lead={segmentos ? <div data-slot="view" className="flex min-w-0 items-center">{segmentos}</div> : identidad} testId={`${testId}-toolbar`}>
        {children && <div className={cn('flex flex-wrap items-center gap-2 sm:justify-end', segmentos && 'ml-auto', expandir && 'min-w-0 flex-1 basis-full sm:basis-auto')}>{children}</div>}
      </Toolbar>
    </section>
  )
}
