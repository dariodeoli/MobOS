import { useCallback, useEffect, useState } from 'react'
import { EVENTO_PREFERENCIAS, avisarPreferencias, guardarPreferencias, leerPreferencias } from '@/lib/preferencias'

// Preferencias del dispositivo sincronizadas entre los componentes que las
// usan (p. ej. el menú y el temporizador de bloqueo del panel).
export function usePreferencias(userId) {
  const [preferencias, setPreferencias] = useState(() => leerPreferencias(userId))

  useEffect(() => { setPreferencias(leerPreferencias(userId)) }, [userId])

  useEffect(() => {
    const refrescar = () => setPreferencias(leerPreferencias(userId))
    window.addEventListener(EVENTO_PREFERENCIAS, refrescar)
    window.addEventListener('storage', refrescar)
    return () => {
      window.removeEventListener(EVENTO_PREFERENCIAS, refrescar)
      window.removeEventListener('storage', refrescar)
    }
  }, [userId])

  const guardar = useCallback(cambios => {
    const siguientes = guardarPreferencias(userId, cambios)
    setPreferencias(siguientes)
    avisarPreferencias()
    return siguientes
  }, [userId])

  return [preferencias, guardar]
}
