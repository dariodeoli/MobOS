import { useCallback, useEffect, useState } from 'react'
import { resumenCola, sincronizarCola, suscribirCola } from '@/lib/offline/ventas'
import { useOnlineStatus } from './useOnlineStatus'

const VACIO = { pendientes: 0, conflictos: 0, enviadas: 0, ultimaSync: null, total: 0 }

// Estado de la cola de ventas offline para el POS. Al volver la conexión (y al
// montar la pantalla, para vaciar lo que quedó de una sesión anterior) intenta
// sincronizar sola; el botón manual siempre está disponible.
export function useColaOffline({ autoSincronizar = true } = {}) {
  const [resumen, setResumen] = useState(VACIO)
  const [sincronizando, setSincronizando] = useState(false)
  const enLinea = useOnlineStatus()

  const refrescar = useCallback(() => {
    resumenCola().then(setResumen).catch(() => {})
  }, [])

  useEffect(() => {
    refrescar()
    return suscribirCola(setResumen)
  }, [refrescar])

  const sincronizar = useCallback(async () => {
    setSincronizando(true)
    try {
      setResumen(await sincronizarCola())
    } catch {
      /* sin IndexedDB o sin sesión: el indicador queda como estaba */
    } finally {
      setSincronizando(false)
    }
  }, [])

  useEffect(() => {
    if (autoSincronizar && enLinea) sincronizar()
  }, [autoSincronizar, enLinea, sincronizar])

  return { ...resumen, sincronizando, sincronizar, refrescar, enLinea }
}
