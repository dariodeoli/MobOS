import { useEffect, useState } from 'react'
import { subscribe } from '@/lib/storage'

// Contador que cambia con cada actualización del espejo local (hidratación del
// API, mutaciones o demo). Las pantallas que leen `getProductos()`/`listVentas()`
// fuera del ciclo de estado lo usan para repintar (#257): así el refresco en
// segundo plano del catálogo se ve sin recargar la app.
export function useAlmacenRevision() {
  const [revision, setRevision] = useState(0)
  useEffect(() => subscribe(() => setRevision(valor => valor + 1)), [])
  return revision
}
