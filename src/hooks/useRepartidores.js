import { useEffect, useState } from 'react'
import { api } from '@/lib/api/client'
import { equipoDeRepartoDemo } from '@/lib/demo/delivery.js'

// Repartidores que se pueden asignar a un pedido de Delivery (POS y Pedidos).
// Solo se piden cuando hacen falta (`activo`); sin permiso o sin red la lista
// queda vacía y el POS ofrece «Asignar después» (nunca bloquea la venta).
export function useRepartidores({ activo = true, esDemo = false } = {}) {
  const [repartidores, setRepartidores] = useState([])
  useEffect(() => {
    if (!activo) return undefined
    if (esDemo) { setRepartidores(equipoDeRepartoDemo()); return undefined }
    let vivo = true
    api.get('/api/delivery/team')
      .then((filas) => { if (vivo) setRepartidores(Array.isArray(filas) ? filas : []) })
      .catch(() => { if (vivo) setRepartidores([]) })
    return () => { vivo = false }
  }, [activo, esDemo])
  return repartidores
}
