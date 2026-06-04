import { useEffect, useReducer } from 'react'
import { subscribe } from '@/lib/storage'

// Fuerza un re-render cada vez que cambian los datos en storage.
// El componente lee los datos directamente con los getters de storage.
// Patrón de "tiempo real" dentro del navegador y entre pestañas.
export function useLive() {
  const [, tick] = useReducer((x) => x + 1, 0)
  useEffect(() => subscribe(tick), [])
}
