import { cn } from '@/lib/utils'

// Composición de módulo: contexto, navegación, controles y acciones en una
// sola superficie. Los controles concretos siguen viviendo en owncoding-ui;
// este objeto solo ordena sus slots sin imponer lógica a cada pantalla.
export default function ModuleToolbar({
  ariaLabel = 'Herramientas del módulo',
  description,
  navigation,
  navigationLabel = 'Secciones del módulo',
  controls,
  actions,
  className,
}) {
  const tieneContexto = Boolean(description || navigation)
  const tieneHerramientas = Boolean(controls || actions)

  return (
    <section
      aria-label={ariaLabel}
      className={cn('min-w-0 rounded-xl border border-ink-600 bg-ink-800/60 p-3 sm:p-4', className)}
    >
      {tieneContexto && (
        <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          {description && <div className="min-w-0 text-sm leading-5 text-mute">{description}</div>}
          {navigation && (
            <nav aria-label={navigationLabel} className="flex shrink-0 flex-wrap gap-1">
              {navigation}
            </nav>
          )}
        </div>
      )}

      {tieneHerramientas && (
        <div
          className={cn(
            'grid min-w-0 gap-2 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center',
            tieneContexto && 'mt-3 border-t border-ink-600 pt-3',
          )}
        >
          {controls && <div className="flex min-w-0 flex-wrap items-center gap-2">{controls}</div>}
          {actions && (
            <div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
              {actions}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
