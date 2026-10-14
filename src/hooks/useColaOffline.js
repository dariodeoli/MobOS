import { useCallback, useEffect, useState } from 'react'
import { listarCola, reporteCola, resumenCola, sincronizarCola, suscribirCola } from '@/lib/offline/ventas'
import { isDemoRuntime } from '@/lib/demoMode'
import { EVENTO_CAMBIO_EMPRESA } from '@/lib/storage'
import { useOnlineStatus } from './useOnlineStatus'

const VACIO = { pendientes: 0, sinEmpresa: 0, conflictos: 0, enviadas: 0, ultimaSync: null, total: 0, otraEmpresa: 0 }

// Estado de la cola de ventas offline para el POS. Al volver la conexión (y al
// montar la pantalla, para vaciar lo que quedó de una sesión anterior) intenta
// sincronizar sola; el botón manual siempre está disponible.
// En la demo no existe cola offline (#201): no se abre la base local del
// navegador ni se muestran ventas reales pendientes de la persona.
export function useColaOffline({ autoSincronizar = true } = {}) {
  const [resumen, setResumen] = useState(VACIO)
  const [items, setItems] = useState([])
  const [reporte, setReporte] = useState(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [empresaVersion, setEmpresaVersion] = useState(0)
  const enLinea = useOnlineStatus()

  const refrescar = useCallback(() => {
    if (isDemoRuntime) return
    resumenCola().then(setResumen).catch(() => {})
    listarCola().then(setItems).catch(() => {})
    reporteCola().then(setReporte).catch(() => {})
  }, [])

  useEffect(() => {
    if (isDemoRuntime) return undefined
    refrescar()
    return suscribirCola(() => refrescar())
  }, [refrescar])

  // Al cambiar de empresa el contador, la lista y el reporte son de OTRA empresa:
  // se recalculan y la sincronización automática vuelve a correr con la nueva sesión.
  useEffect(() => {
    if (isDemoRuntime || typeof window === 'undefined') return undefined
    const alCambiar = () => { setEmpresaVersion((v) => v + 1); refrescar() }
    window.addEventListener(EVENTO_CAMBIO_EMPRESA, alCambiar)
    return () => window.removeEventListener(EVENTO_CAMBIO_EMPRESA, alCambiar)
  }, [refrescar])

  const sincronizar = useCallback(async () => {
    if (isDemoRuntime) return
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
    if (isDemoRuntime || !autoSincronizar || !enLinea) return
    sincronizar()
  }, [autoSincronizar, enLinea, sincronizar, empresaVersion])

  return { ...resumen, items, reporte, sincronizando, sincronizar, refrescar, enLinea }
}
