import { ReceiptText } from 'lucide-react'
import FilaVenta from './FilaVenta'
import { separarColor } from '@/utils/colores'

// Filas editables de la venta en curso. El encabezado, los ajustes y el total
// viven en el bloque de la venta (PasoCarrito): acá solo se listan los
// productos para que la jerarquía del resumen quede en un solo lugar.
export default function ListaVenta({
  items,
  productos,
  familias,
  esDemo,
  guardando,
  puedeDescontar,
  precioDe,
  quitarItem,
  editarItem,
  onImei,
}) {
  const variantesDe = item => {
    const { base } = separarColor(item.nombre || '')
    return familias.find(fam => fam.base === base)?.items || []
  }

  if (!items.length) {
    // Ticket vacío: un estado calmo (ícono, una línea y el atajo), sin listas
    // de consejos. Compartir el carrito vive en la fila de acciones del ticket.
    return (
      <div data-carrito-vacio className="pos-tk-vacio px-4 py-8 text-center text-sm text-mute md:flex md:flex-col md:items-center md:justify-center md:gap-2 md:py-10">
        <span aria-hidden="true" className="pos-tk-vacio-icono hidden h-12 w-12 items-center justify-center rounded-full md:inline-flex">
          <ReceiptText className="h-6 w-6" strokeWidth={1.5} />
        </span>
        <p>Tocá un producto o buscá para empezar.</p>
        <p className="pos-tk-vacio-atajo hidden text-xs md:block">
          Con productos cargados, <kbd>F2</kbd> cobra.
        </p>
      </div>
    )
  }

  return (
    <div className="pos-tk-lineas divide-y divide-ink-600">
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
          onEditar={patch => editarItem(it.key, patch)}
          onQuitar={() => quitarItem(it.key)}
          onImei={() => onImei(it.key)}
        />
      ))}
    </div>
  )
}
