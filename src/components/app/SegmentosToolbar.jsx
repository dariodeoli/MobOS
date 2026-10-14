import { createContext, useContext } from 'react'

// Fila de vistas de segundo nivel (L2) de Precios: el shell la arma y cada vista
// de Precios la coloca dentro de su propia barra de herramientas (en vez del
// encabezado de página). Sin proveedor (vistas previas) no dibuja nada.
export const SegmentosToolbarContext = createContext(null)

export default function SegmentosToolbar() {
  return useContext(SegmentosToolbarContext)
}
