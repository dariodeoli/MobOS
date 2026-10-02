import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

// Composición compacta de módulo (#256): una sola barra con la identidad del
// módulo (ícono + título + detalle), el contexto a la derecha (fecha, alcance)
// y las acciones juntas al final. Evita el encabezado grande duplicado y que
// los botones queden aislados en una fila vacía. El `h1` sigue siendo el del
// shell: acá el título va como `h2` para no duplicar la identidad de página.
export default function BarraModulo({ icono, titulo, descripcion, contexto, children, className, testId = 'barra-modulo', expandir = false }) {
  return (
    <section
      data-testid={testId}
      aria-label={titulo}
      className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-ink-600 pb-3', className)}
    >
      <div className={cn('flex items-center gap-2.5', expandir ? 'min-w-[11rem] max-w-[14rem] shrink' : 'min-w-[11rem] flex-1')}>
        {icono && (
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-fono/10 text-fono-light">
            <Icon name={icono} className="h-[18px] w-[18px]" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold tracking-tight">{titulo}</h2>
          {descripcion && <p className="mt-0.5 hidden truncate text-xs text-mute sm:block" title={descripcion}>{descripcion}</p>}
        </div>
        {contexto}
      </div>
      {children && <div className={cn('flex flex-wrap items-center gap-2 sm:justify-end', expandir && 'min-w-0 flex-1')}>{children}</div>}
    </section>
  )
}
