import { gs } from '@/utils/calculos'
import { serialEnmascarado } from '@/utils/serial'
import { cn } from '@/lib/utils'

const CONDICION = { NEW: 'Nuevo', USED: 'Seminuevo', REFURBISHED: 'Reacondicionado' }

// Líneas de la venta en el Paso 2 · Cobrar (escritorio y hoja móvil): solo
// lectura. Cada producto con su nombre completo, variante (capacidad y
// condición), IMEI elegido o «Falta elegir IMEI», cantidad × precio, descuento
// y subtotal. Editar = volver a productos.
export default function LineasSoloLectura({ items = [], productos = [], className }) {
  if (!items.length) return null
  return (
    <ul data-testid="cobro-lineas" className={cn('divide-y divide-ink-600', className)}>
      {items.map(it => {
        const producto = productos.find(p => p.id === it.productoId)
        const cantidad = Math.max(1, Number(it.quantity) || 1)
        const precio = Number(it.precio) || 0
        const pct = Number(String(it.descuentoPct ?? '').replace('%', '')) || 0
        const fijo = Number(String(it.descuento ?? '').replace(/\D/g, '')) || 0
        const descuento = pct > 0 ? Math.round((precio * cantidad * pct) / 100) : Math.min(fijo, precio * cantidad)
        const subtotal = precio * cantidad - descuento
        const capacidad = producto?.capacity || producto?.capacidad || ''
        const condicion = CONDICION[producto?.condition || producto?.condicion] || ''
        const variante = [capacidad && !(it.nombre || '').includes(capacidad) ? capacidad : '', condicion].filter(Boolean).join(' · ')
        const serials = it.serials || []
        return (
          <li key={it.key} data-linea-cobro={it.key} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-0.5 px-3 py-2">
            <div className="min-w-0 flex-1 basis-40">
              <b className="block break-words text-sm leading-snug">{it.nombre}</b>
              {variante && <span className="block text-xs text-mute">{variante}</span>}
              {serials.length > 0 ? (
                <span className="block font-mono text-[11px] text-mute">IMEI {serials.map(serialEnmascarado).join(' · ')}</span>
              ) : it.requiereSerie ? (
                <span className="block text-[11px] font-semibold text-warn-text">Falta elegir IMEI</span>
              ) : null}
              <span className="block text-xs tabular-nums text-mute">{cantidad} × {gs(precio)}</span>
              {descuento > 0 && <span className="block text-xs font-semibold tabular-nums text-warn-text">Descuento − {gs(descuento)}</span>}
            </div>
            <span className="pos-money-value v2-numero shrink-0 whitespace-nowrap text-sm font-extrabold tabular-nums text-fono-light">{gs(subtotal)}</span>
          </li>
        )
      })}
    </ul>
  )
}
