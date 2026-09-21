import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'

const claveVistas = (userId) => `mobos:notificaciones-vistas:${userId || 'anon'}`

function leerVistas(userId) {
  try { return Number(localStorage.getItem(claveVistas(userId)) || 0) || 0 } catch { return 0 }
}

// Novedades del panel: se piden al API cuando hace falta y se recuerda en el
// dispositivo hasta cuándo se vieron, para el contador del aviso.
export function useNotificaciones(userId, { activo = true } = {}) {
  const [items, setItems] = useState([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [vistasAt, setVistasAt] = useState(() => leerVistas(userId))

  useEffect(() => { setVistasAt(leerVistas(userId)) }, [userId])

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const data = await api.get('/api/notifications')
      setItems(Array.isArray(data?.items) ? data.items : [])
    } catch (cause) {
      setError(cause?.message || 'No se pudieron cargar las novedades.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    if (activo) cargar()
  }, [activo, cargar])

  const nuevas = items.filter(item => new Date(item.at).getTime() > vistasAt)
  const marcarVistas = useCallback(() => {
    const ahora = Date.now()
    try { localStorage.setItem(claveVistas(userId), String(ahora)) } catch { /* sin persistencia */ }
    setVistasAt(ahora)
  }, [userId])

  return { items, cargando, error, cargar, nuevas, marcarVistas }
}

export default useNotificaciones
