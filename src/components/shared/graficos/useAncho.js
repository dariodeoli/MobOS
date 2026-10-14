import { useEffect, useRef, useState } from 'react'

// Ancho en píxeles del contenedor: los gráficos se dibujan a esa medida para
// que el texto del SVG nunca se deforme. Sin ResizeObserver usa el inicial.
export default function useAncho(inicial = 560) {
  const ref = useRef(null)
  const [ancho, setAncho] = useState(inicial)
  useEffect(() => {
    const nodo = ref.current
    if (!nodo) return undefined
    const medir = () => {
      const w = Math.floor(nodo.getBoundingClientRect().width)
      if (w > 0) setAncho(w)
    }
    medir()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observador = new ResizeObserver(medir)
    observador.observe(nodo)
    return () => observador.disconnect()
  }, [])
  return [ref, ancho]
}
