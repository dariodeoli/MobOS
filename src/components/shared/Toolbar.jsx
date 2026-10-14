import { useEffect, useRef, useState } from 'react'
import { ActionToolbar } from 'owncoding-ui'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

// Barra de herramientas de una pestaña (docs/PANTALLAS.md regla 7). Envuelve el
// `ActionToolbar` de owncoding-ui y ordena sus huecos: búsqueda · filtros ·
// orden · vista (L2 segmentado) · [hijos libres] · Más + acción principal a la
// derecha. Un hueco vacío no deja contenedor. `lead` es la identidad compacta
// que aún usa `BarraModulo`. `plano` quita caja y fondo (barra embebida en otra
// caja). `searchClassName` ajusta el ancho del hueco de búsqueda.
//
// Patrón de las pantallas de lista (#388):
//  - Escritorio: UNA fila — buscador (flexible, 320–420 px) · chips · orden (ancho
//    según su contenido) · vista · acción principal a la derecha.
//  - Celular (<640 px): buscador + acción principal en una fila; chips en una fila
//    con scroll horizontal; `sort` y `view` detrás de UN botón «Ordenar / Vista»
//    de 44 px que abre un panel (el mismo DOM: no se duplican controles).
// En celular los huecos se reordenan con `order` negativo para no depender de
// que los `children` libres (orden 0) vayan primero.
export default function Toolbar({ label = 'Herramientas', search, filters, sort, view, primary, more, lead, children, plano = false, className, searchClassName, testId = 'toolbar' }) {
  const derecha = more || primary
  const ordenVista = Boolean(sort || view)
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef(null)
  useEffect(() => {
    if (!abierto) return undefined
    const cerrarFuera = (event) => {
      if (event.target instanceof Node && raiz.current?.contains(event.target)) return
      setAbierto(false)
    }
    const cerrarEscape = (event) => { if (event.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', cerrarFuera)
    document.addEventListener('keydown', cerrarEscape)
    return () => { document.removeEventListener('mousedown', cerrarFuera); document.removeEventListener('keydown', cerrarEscape) }
  }, [abierto])
  return (
    <div ref={raiz} data-testid={testId} className="relative min-w-0">
      <ActionToolbar
        label={label}
        className={cn(
          'gap-x-3 gap-y-2',
          plano && 'rounded-none border-0 bg-transparent p-0',
          className,
        )}
      >
        {lead}
        {search && <div data-slot="search" className={cn('min-w-0 max-sm:order-[-4] max-sm:flex-1 max-sm:basis-40 sm:min-w-[20rem] sm:max-w-[26.25rem] sm:flex-1 sm:basis-80', searchClassName)}>{search}</div>}
        {filters && (
          <div
            data-slot="filters"
            className={cn(
              'flex min-w-0 items-center gap-2 sm:flex-wrap',
              'max-sm:order-[-2] max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:py-0.5 max-sm:[scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:hidden max-sm:[&>*]:flex-nowrap max-sm:[&>*]:shrink-0 max-sm:[&_button]:shrink-0',
              ordenVista ? 'max-sm:flex-1 max-sm:basis-[calc(100%-3.75rem)]' : 'max-sm:basis-full',
            )}
          >
            {filters}
          </div>
        )}
        {ordenVista && (
          <>
            <button
              type="button"
              data-slot="sort-view-toggle"
              aria-label="Ordenar / Vista"
              title="Ordenar / Vista"
              aria-haspopup="true"
              aria-expanded={abierto}
              onClick={() => setAbierto((valor) => !valor)}
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-ink-500 text-mute transition hover:border-fono/40 hover:text-fore focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono max-sm:order-[-1] sm:hidden"
            >
              <Icon name="sliders" className="h-[18px] w-[18px]" />
            </button>
            <div
              data-slot="sort-view"
              className={cn(
                'sm:contents',
                abierto
                  ? 'max-sm:absolute max-sm:right-0 max-sm:top-full max-sm:z-30 max-sm:mt-1 max-sm:w-[min(20rem,100%)] max-sm:space-y-3 max-sm:rounded-xl max-sm:border max-sm:border-ink-500 max-sm:bg-paper max-sm:p-3 max-sm:shadow-xl'
                  : 'max-sm:hidden',
              )}
            >
              {sort && (
                <div data-slot="sort" className="min-w-0 sm:shrink-0 sm:[&_select]:w-auto">
                  <span className="mb-1 block text-xs font-medium text-mute sm:hidden">Ordenar</span>
                  {sort}
                </div>
              )}
              {view && (
                <div data-slot="view" className="flex min-w-0 flex-col items-start sm:flex-row sm:items-center">
                  <span className="mb-1 block text-xs font-medium text-mute sm:hidden">Vista</span>
                  {view}
                </div>
              )}
            </div>
          </>
        )}
        {children}
        {derecha && (
          <div data-slot="actions" className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2 max-sm:order-[-3]">
            {more}
            {primary}
          </div>
        )}
      </ActionToolbar>
    </div>
  )
}
