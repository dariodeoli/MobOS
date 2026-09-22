import { Badge } from '@/components/ui'

// Estado con badge a partir de un mapa compartido (`lib/estadosPedido.js`):
// misma etiqueta y color en todas las pantallas. Si el estado no está en el
// mapa se muestra el valor crudo y, si tampoco hay valor, el vacío explícito
// (nunca un badge en blanco).
export default function EstadoBadge({ mapa, valor, vacio = 'Sin estado' }) {
  const item = mapa?.[valor]
  if (item) return <Badge color={item.color}>{item.label}</Badge>
  return <Badge>{valor || vacio}</Badge>
}
