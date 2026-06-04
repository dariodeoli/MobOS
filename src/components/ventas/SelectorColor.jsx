import { gs } from '@/utils/calculos'
import { Card, Button } from '@/components/ui'

// Ventana para elegir el color de una familia de producto (ej. Protector 17
// Pro Max → Azul / Naranja / Silver).
export default function SelectorColor({ base, items, onPick, onCancel }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="text-center text-3xl mb-1">🎨</div>
        <h2 className="text-center font-extrabold">{base}</h2>
        <p className="text-center text-sm text-slate-500 mb-4">Elegí el color</p>
        <div className="grid grid-cols-2 gap-2">
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => onPick(it)}
              className="rounded-xl border-2 border-slate-200 p-3 text-left transition hover:border-fono hover:bg-fono-light active:scale-[.98]"
            >
              <div className="font-bold text-sm text-slate-800">{it.color || it.nombre}</div>
              {it.precioVenta > 0 && (
                <div className="text-xs text-fono font-semibold mt-0.5">{gs(it.precioVenta)}</div>
              )}
            </button>
          ))}
        </div>
        <Button variant="ghost" className="w-full mt-3" onClick={onCancel}>
          Cancelar
        </Button>
      </Card>
    </div>
  )
}
