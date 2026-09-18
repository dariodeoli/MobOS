import { useEffect, useState } from 'react'

// Ancho de pantalla según el mismo umbral que usa el layout (Tailwind `lg`).
// Se resuelve en JS y no con una clase CSS porque hay bloques que NO deben
// existir en el DOM cuando no se ven: un duplicado oculto con el mismo texto
// rompe las lecturas por orden (`getByText(...).first()`).
export function usePantallaAngosta(consulta = '(min-width: 1024px)') {
  const [angosta, setAngosta] = useState(
    () => typeof window !== 'undefined' && !window.matchMedia(consulta).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(consulta)
    const alCambiar = evento => setAngosta(!evento.matches)
    setAngosta(!mq.matches)
    mq.addEventListener('change', alCambiar)
    return () => mq.removeEventListener('change', alCambiar)
  }, [consulta])
  return angosta
}
