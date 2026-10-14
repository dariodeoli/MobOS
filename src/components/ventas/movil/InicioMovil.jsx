import Icon from '@/components/shared/Icon'
import { gs } from '@/utils/calculos'
import { cn } from '@/lib/utils'
import { textoArticulos } from './posMovil'

// Inicio del POS en celular (#429): acciones en mosaico de dos columnas y la
// barra azul del carrito pegada sobre la navegación. Solo presentación: cada
// acción abre una hoja o una pantalla que ya existe.
export function AccionesInicio({ acciones }) {
  return (
    <div data-testid="pos-acciones-movil" className="grid grid-cols-2 gap-2">
      {acciones.map(({ id, icono, titulo, detalle, onClick, disabled, destacado }) => (
        <button
          key={id}
          type="button"
          data-testid={`accion-${id}`}
          onClick={onClick}
          disabled={disabled}
          className={cn(
            'flex min-h-14 min-w-0 items-center gap-2.5 rounded-2xl border px-3 py-2 text-left transition active:scale-[.98] disabled:opacity-40',
            destacado ? 'border-fono/50 bg-fono/10' : 'border-ink-600 bg-ink-800 enabled:hover:border-fono',
          )}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-fono/10 text-fono-light">
            <Icon name={icono} className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="line-clamp-2 break-words text-[13px] font-bold leading-tight">{titulo}</span>
            {detalle && <span className="block truncate text-[11px] leading-tight text-mute">{detalle}</span>}
          </span>
        </button>
      ))}
    </div>
  )
}

// Barra del carrito: cantidad y total siempre a la vista; un toque abre la hoja.
export function BarraCarrito({ cantidad, total, onAbrir }) {
  if (cantidad <= 0) return null
  return (
    <div
      data-testid="pos-barra-carrito"
      className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom,0px))] z-30 px-3 pb-2 pt-1 md:hidden"
    >
      <button
        type="button"
        data-testid="pos-barra-carrito-abrir"
        onClick={onAbrir}
        className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl bg-fono px-4 text-onbrand shadow-float transition active:scale-[.99]"
      >
        <span className="flex min-w-0 items-center gap-2 text-left">
          <Icon name="cart" className="h-5 w-5 shrink-0" />
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-wider opacity-90">Carrito</span>
            <span data-testid="barra-cantidad" className="block truncate text-sm font-bold">{textoArticulos(cantidad)}</span>
          </span>
        </span>
        <span data-testid="barra-total" className="v2-numero whitespace-nowrap text-lg font-extrabold tabular-nums">{gs(total)}</span>
      </button>
    </div>
  )
}
