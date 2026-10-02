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
    return (
      <div className="px-4 py-8 text-center text-sm text-mute">
        <p>Todavía no agregaste productos. Buscá uno arriba y hacé clic para sumarlo.</p>
        <p className="mt-1 text-xs">
          Este carrito es tuyo (privado de tu sesión). Para pasarlo a otra persona, usá
          «Suspender venta»: queda en Ventas suspendidas, compartidas con el equipo.
        </p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-ink-600">
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
