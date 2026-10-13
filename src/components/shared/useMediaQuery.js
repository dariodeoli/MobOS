import { useEffect, useState } from 'react'

const coincide = (consulta) => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(consulta).matches

// Hook mínimo de media query: valor inicial síncrono (sin parpadeo) y
// suscripción al cambio. Sin `matchMedia` (SSR, tests) devuelve `porDefecto`.
export function useMediaQuery(consulta, porDefecto = false) {
  const [valor, setValor] = useState(() => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? coincide(consulta) : porDefecto))
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const media = window.matchMedia(consulta)
    const actualizar = () => setValor(media.matches)
    actualizar()
    media.addEventListener('change', actualizar)
    return () => media.removeEventListener('change', actualizar)
  }, [consulta])
  return valor
}

export const CONSULTA_MD = '(min-width: 768px)'
