import { useEffect, useState } from 'react'
import { api } from '@/lib/api/client'
import { isDemoRuntime } from '@/lib/demoMode'

// ¿La empresa tiene correo saliente? Solo entonces se ofrece «Avisar por correo».
// Se consulta una vez por pestaña (health no cambia mientras se trabaja). En la
// demo siempre está disponible para poder mostrar el flujo completo.
let consulta = null

export function leerCorreoSaliente() {
  if (isDemoRuntime) return Promise.resolve(true)
  if (!consulta) {
    consulta = api.get('/api/health', { cacheMs: 60000 })
      .then((salud) => salud?.services?.email === 'configured')
      .catch(() => { consulta = null; return false })
  }
  return consulta
}

export function reiniciarCorreoSaliente() { consulta = null }

export function useCorreoSaliente() {
  const [disponible, setDisponible] = useState(isDemoRuntime)
  useEffect(() => {
    let vivo = true
    leerCorreoSaliente().then((valor) => { if (vivo) setDisponible(Boolean(valor)) })
    return () => { vivo = false }
  }, [])
  return disponible
}
