import { useEffect, useRef } from 'react'

// Bloquea la sesión tras N minutos sin actividad real (mouse, teclado, tacto,
// rueda o scroll). `activo=false` lo desactiva: ya está bloqueado, o el panel
// no corresponde. Volver a la pestaña también cuenta como actividad.
export function useBloqueoInactividad({ minutos, activo, onBloquear }) {
  const bloquearRef = useRef(onBloquear)
  bloquearRef.current = onBloquear

  useEffect(() => {
    if (!activo || !minutos) return undefined
    let timer
    const programar = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => bloquearRef.current?.(), minutos * 60 * 1000)
    }
    const eventos = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'scroll']
    programar()
    eventos.forEach(evento => window.addEventListener(evento, programar, { passive: true }))
    const alVolver = () => { if (document.visibilityState === 'visible') programar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      window.clearTimeout(timer)
      eventos.forEach(evento => window.removeEventListener(evento, programar))
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [minutos, activo])
}
