import { useCallback, useEffect, useRef, useState } from 'react'
import { hayVersionNueva } from '@/lib/actualizacion'

export const INTERVALO_VERSION_MS = 5 * 60 * 1000

// Revisa si el deploy sirve un bundle nuevo (#214): al montar, cada
// `intervaloMs` con la pestaña visible y al volver a la pestaña o a la conexión.
// Si la persona lo descarta, no se vuelve a mostrar en esta pestaña.
export function useVersionNueva({ intervaloMs = INTERVALO_VERSION_MS } = {}) {
  const [disponible, setDisponible] = useState(false)
  const [descartada, setDescartada] = useState(false)
  const enCurso = useRef(false)

  const revisar = useCallback(async () => {
    if (enCurso.current) return
    enCurso.current = true
    try {
      if (await hayVersionNueva()) setDisponible(true)
    } finally {
      enCurso.current = false
    }
  }, [])

  useEffect(() => {
    void revisar()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void revisar()
    }, intervaloMs)
    const alVolver = () => { if (document.visibilityState === 'visible') void revisar() }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)
    window.addEventListener('online', alVolver)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
      window.removeEventListener('online', alVolver)
    }
  }, [intervaloMs, revisar])

  const descartar = useCallback(() => setDescartada(true), [])

  return { disponible: disponible && !descartada, descartar }
}
