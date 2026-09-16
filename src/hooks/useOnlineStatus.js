import { useEffect, useState } from 'react'

// Estado de conexión del navegador. Se actualiza con los eventos online/offline
// para avisar cuando la app trabaja sin red (los datos quedan viejos en silencio).
export function useOnlineStatus() {
  const [enLinea, setEnLinea] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)
  useEffect(() => {
    const conectar = () => setEnLinea(true)
    const desconectar = () => setEnLinea(false)
    window.addEventListener('online', conectar)
    window.addEventListener('offline', desconectar)
    return () => {
      window.removeEventListener('online', conectar)
      window.removeEventListener('offline', desconectar)
    }
  }, [])
  return enLinea
}
