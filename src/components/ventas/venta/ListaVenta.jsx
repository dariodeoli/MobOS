import FilaVenta from './FilaVenta'
import { gs } from '@/utils/calculos'
import { separarColor } from '@/utils/colores'

// Lista de productos de la venta con edición por fila. Se muestra apenas se
// agrega el primer producto (paso 1) y también en la revisión del carrito.
export default function ListaVenta({
  items,
  productos,
  familias,
  esDemo,
  guardando,
  puedeDescontar,
  precioDe,
  precioListaDe,
  totalCarrito,
  quitarItem,
  editarItem,
  onImei,
  titulo = 'Productos de esta venta',
}) {
  const variantesDe = item => {
    const { base } = separarColor(item.nombre || '')
    return familias.find(fam => fam.base === base)?.items || []
  }
  const unidades = items.reduce((a, it) => a + (it.quantity || 1), 0)

  return (
    <div className="md:col-span-2 overflow-hidden rounded-2xl border border-ink-600">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-600 bg-ink-700/60 px-4 py-3">
        <span className="text-xs font-bold uppercase tracking-wider text-mute">{titulo}</span>
        <span className="text-xs text-mute">
          {items.length} {items.length === 1 ? 'producto' : 'productos'} · {unidades}{' '}
          {unidades === 1 ? 'unidad' : 'unidades'}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-mute">Todavía no agregaste productos.</p>
      ) : (
        <div className="max-h-[28rem] divide-y divide-ink-600 overflow-y-auto">
          {items.map(it => (
            <FilaVenta
              key={it.key}
              item={it}
              producto={productos.find(p => p.id === it.productoId)}
              variantes={variantesDe(it)}
              puedeDescontar={puedeDescontar}
              esDemo={esDemo}
              guardando={guardando}
              precioDe={precioDe}
              precioLista={precioListaDe?.(it)}
              onEditar={patch => editarItem(it.key, patch)}
              onQuitar={() => quitarItem(it.key)}
              onImei={() => onImei(it.key)}
            />
          ))}
        </div>
      )}
      <div className="flex items-center justify-between border-t border-ink-600 bg-ink-700 px-4 py-2">
        <span className="text-xs font-bold uppercase text-mute">Subtotal</span>
        <span className="text-base font-extrabold tabular-nums">{gs(totalCarrito)}</span>
      </div>
    </div>
  )
}
