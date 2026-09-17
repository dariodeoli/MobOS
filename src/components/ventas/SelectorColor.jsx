import { gs } from '@/utils/calculos'
import { Card, Button } from '@/components/ui'
import Icon from '@/components/shared/Icon'

// Ventana para elegir el color de una familia de producto (ej. Protector 17
// Pro Max Azul / Naranja / Silver).
export default function SelectorColor({ base, items, onPick, onCancel }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onCancel}
      role="presentation"
    >
      <Card className="w-full max-w-sm" role="dialog" aria-modal="true" aria-labelledby="selector-color-title" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-fono/15 text-fono-light">
          <Icon name="tag" className="h-5 w-5" />
        </div>
        <h2 id="selector-color-title" className="mt-2 text-center font-extrabold tracking-tight">{base}</h2>
        <p className="mb-4 text-center text-sm text-mute">Elegí el color de esta venta</p>
        <div className="grid grid-cols-2 gap-2">
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => onPick(it)}
              type="button"
              aria-label={`Elegir ${it.color || it.nombre}`}
              className="min-h-16 rounded-xl border border-ink-600 p-3 text-left transition hover:border-fono hover:bg-fono/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fono active:scale-[.98]"
            >
              <div className="text-sm font-bold text-fore">{it.color || it.nombre}</div>
              {it.precioVenta > 0 && (
                <div className="mt-0.5 text-xs font-semibold tabular-nums text-fono-light">{gs(it.precioVenta)}</div>
              )}
            </button>
          ))}
        </div>
        <Button variant="ghost" className="mt-3 w-full" onClick={onCancel}>
          Cancelar
        </Button>
      </Card>
    </div>
  )
}
