import { useNavigate } from 'react-router-dom'
import SegmentedField from '@/components/shared/SegmentedField'

// #287: Productos y Unidades son el **mismo objeto** con dos vistas: el
// producto (atributos, precios, stock) y sus unidades (IMEI/serial, estado
// físico, ubicación). Este switch vive en la barra de las dos pantallas y
// conserva el contexto al cambiar de vista: la búsqueda sigue puesta y, si
// venías de un producto, la vista de Unidades queda acotada a ese producto.
export default function VistaProductosUnidades({ vista, q = '', productoId = '' }) {
  const navigate = useNavigate()
  const destino = (siguiente) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    // El producto viaja en las dos direcciones: Unidades queda acotada a él y
    // Productos abre su ficha.
    if (productoId) params.set('producto', productoId)
    const base = siguiente === 'unidades' ? '/inventario/unidades' : '/productos'
    return `${base}${params.toString() ? `?${params.toString()}` : ''}`
  }
  return (
    <span data-testid="vista-productos-unidades" className="inline-flex">
      <SegmentedField
        value={vista}
        onChange={(siguiente) => { if (siguiente !== vista) navigate(destino(siguiente)) }}
        ariaLabel="Productos y Unidades son el mismo objeto: elegí la vista"
        options={[['productos', 'Productos'], ['unidades', 'Unidades']]}
      />
    </span>
  )
}
