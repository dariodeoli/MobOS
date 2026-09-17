import { useEffect, useState } from 'react'

// Búsqueda instantánea sin golpear el servidor en cada tecla: devuelve el
// valor retrasado unos milisegundos. Se siente inmediato pero evita una
// consulta por pulsación (mismo patrón que CityAutocomplete).
export function useBusquedaDiferida(valor, retraso = 250) {
  const [diferido, setDiferido] = useState(valor)
  useEffect(() => {
    const timer = setTimeout(() => setDiferido(valor), retraso)
    return () => clearTimeout(timer)
  }, [valor, retraso])
  return diferido
}
