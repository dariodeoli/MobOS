import { useEffect, useState } from 'react'
import { horaServidorMs } from '@/lib/storage'

// Compara el reloj del equipo con el del servidor. Si están desfasados por más
// de ~2 horas (típico: la fecha del equipo mal puesta), devuelve la diferencia
// en horas para avisar; si está bien, devuelve 0.
export function useReloj() {
  const [desfaseHoras, setDesfaseHoras] = useState(0)
  useEffect(() => {
    let activo = true
    horaServidorMs().then((ms) => {
      if (!activo || !ms) return
      const diff = Math.abs(ms - Date.now())
      setDesfaseHoras(diff > 2 * 3600 * 1000 ? Math.round(diff / 3600000) : 0)
    })
    return () => {
      activo = false
    }
  }, [])
  return desfaseHoras
}
