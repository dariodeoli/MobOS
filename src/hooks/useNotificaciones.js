import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'

const claveVistas = (userId) => `mobos:notificaciones-vistas:${userId || 'anon'}`

function leerVistas(userId) {
  try { return Number(localStorage.getItem(claveVistas(userId)) || 0) || 0 } catch { return 0 }
}

// Ejemplos ficticios de la demo (#321): la bandeja se evalúa con datos, sin
// tocar el API ni persistir nada. Los `href` apuntan a pantallas que existen
// en la demo y cada ítem se marca con `demo` para mostrarlo como ejemplo.
const hace = (minutos) => new Date(Date.now() - minutos * 60000).toISOString()

export function ejemplosDemo() {
  return [
    { id: 'demo-notif-1', demo: true, kind: 'PEDIDO', title: 'Pedido nuevo sin cobrar', detail: 'Cliente Lucía Fernández · MOB-0042 · Gs 4.850.000', at: hace(6), href: '/pedidos' },
    { id: 'demo-notif-2', demo: true, kind: 'APROBACION', title: 'Descuento fuera de política', detail: 'Ana pidió 12% en iPhone 15 · esperando decisión de gerencia', at: hace(24), href: '/autorizaciones' },
    { id: 'demo-notif-3', demo: true, kind: 'TAREA', title: 'Orden de taller sin técnico', detail: 'Equipo recibido · esperando asignación', at: hace(95), href: '/servicio' },
    { id: 'demo-notif-4', demo: true, kind: 'TRANSITO', title: 'Llegó el equipo apartado', detail: 'iPhone 14 · reserva en tránsito lista para vender', at: hace(300), href: '/inventario/unidades' },
  ]
}

// Novedades del panel: se piden al API cuando hace falta y se recuerda en el
// dispositivo hasta cuándo se vieron, para el contador del aviso. En la demo
// se sirven ejemplos ficticios (sin API) para poder evaluar la bandeja.
export function useNotificaciones(userId, { activo = true, demo = false } = {}) {
  const [items, setItems] = useState([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [vistasAt, setVistasAt] = useState(() => leerVistas(userId))

  useEffect(() => { setVistasAt(leerVistas(userId)) }, [userId])

  const cargar = useCallback(async () => {
    if (demo) {
      setItems(ejemplosDemo())
      setError('')
      setCargando(false)
      return
    }
    setCargando(true)
    setError('')
    try {
      // Novedades en vivo: el «Actualizar» del panel y el aviso de INV al
      // vendedor (#280) no pueden quedar atrás por la caché corta de GET.
      const data = await api.get('/api/notifications', { cacheMs: 0 })
      setItems(Array.isArray(data?.items) ? data.items : [])
    } catch (cause) {
      setError(cause?.message || 'No se pudieron cargar las novedades.')
    } finally {
      setCargando(false)
    }
  }, [demo])

  useEffect(() => {
    if (activo || demo) cargar()
  }, [activo, demo, cargar])

  const nuevas = items.filter(item => new Date(item.at).getTime() > vistasAt)
  const marcarVistas = useCallback(() => {
    const ahora = Date.now()
    try { localStorage.setItem(claveVistas(userId), String(ahora)) } catch { /* sin persistencia */ }
    setVistasAt(ahora)
  }, [userId])

  return { items, cargando, error, cargar, nuevas, marcarVistas }
}

export default useNotificaciones
