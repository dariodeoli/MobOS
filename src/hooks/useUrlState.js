import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

// Filtros y pestañas que viven en la URL (?clave=valor): el enlace se puede
// compartir, recargar conserva el estado y el botón atrás vuelve al anterior.
// El valor por defecto no se escribe en la URL.
export function useUrlState(key, defaultValue = '') {
  const [params, setParams] = useSearchParams()
  const value = params.get(key) || defaultValue
  const setValue = useCallback(
    next => {
      setParams(
        current => {
          const following = new URLSearchParams(current)
          const valor = next ?? ''
          if (valor === '' || valor === defaultValue) following.delete(key)
          else following.set(key, String(valor))
          return following
        },
        { replace: true },
      )
    },
    [key, defaultValue, setParams],
  )
  return [value, setValue]
}
