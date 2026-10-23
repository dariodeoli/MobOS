// Estado de módulos de la empresa, compartido por el panel, la pantalla
// «Módulos», el stock y la búsqueda. Un solo pedido a /api/tenant/modules; se
// refresca cuando alguien cambia un módulo en esta pestaña
// («mobos:module-store-updated») y al volver el foco a la ventana (otra sesión
// pudo cambiarlo; el servidor igual rechaza con 403).
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { moduloActivo, vistaActiva } from '@/lib/modulos'
import { estadoModulosSesion, suscribirModulosSesion } from '@/lib/demo/modulosSesion'

let estado = { clave: null, data: null, resuelto: false }
const oyentes = new Set()
let numeroPedido = 0

function publicar(siguiente) {
  estado = siguiente
  oyentes.forEach(oyente => oyente())
}

async function pedir(clave, { forzar = false } = {}) {
  const pedido = ++numeroPedido
  try {
    const data = await api.get('/api/tenant/modules', forzar ? { cacheMs: 0 } : undefined)
    if (pedido === numeroPedido && estado.clave === clave) publicar({ clave, data, resuelto: true })
  } catch {
    if (pedido === numeroPedido && estado.clave === clave) publicar({ clave, data: estado.data, resuelto: true })
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('mobos:module-store-updated', evento => {
    if (!estado.data) return
    publicar({ ...estado, data: { ...estado.data, state: evento.detail } })
  })
}

const suscribir = oyente => { oyentes.add(oyente); return () => oyentes.delete(oyente) }
const instantanea = () => estado

/** Para tests: reinicia el estado compartido. */
export function reiniciarModulos() {
  numeroPedido += 1
  publicar({ clave: null, data: null, resuelto: false })
}

export function useModulos() {
  const { esDemo, sesion, empresa } = useSesion()
  const actual = useSyncExternalStore(suscribir, instantanea, instantanea)
  // Demo: los módulos viven en memoria de la sesión y se pueden apagar de verdad.
  const estadoDemo = useSyncExternalStore(suscribirModulosSesion, estadoModulosSesion, estadoModulosSesion)
  const habilitado = !esDemo && Boolean(sesion)
  const clave = habilitado ? String(empresa?.id ?? 'sin-empresa') : null

  useEffect(() => {
    if (!habilitado) {
      if (estado.clave !== null || !estado.resuelto) publicar({ clave: null, data: null, resuelto: true })
      return undefined
    }
    if (estado.clave !== clave) {
      publicar({ clave, data: null, resuelto: false })
      pedir(clave)
    }
    const alVolver = () => { if (document.visibilityState !== 'hidden') pedir(clave, { forzar: true }) }
    window.addEventListener('focus', alVolver)
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      window.removeEventListener('focus', alVolver)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [habilitado, clave])

  const fuenteDemo = useMemo(() => (esDemo ? { state: estadoDemo } : null), [esDemo, estadoDemo])
  const fuente = esDemo ? fuenteDemo : habilitado && actual.clave === clave ? actual.data : null
  const resuelto = !habilitado || (actual.clave === clave && actual.resuelto)
  const activo = useCallback(id => moduloActivo(fuente, id), [fuente])
  const vistaVisible = useCallback(id => vistaActiva(fuente, id), [fuente])
  const refrescar = useCallback(() => (clave ? pedir(clave, { forzar: true }) : Promise.resolve()), [clave])
  return useMemo(
    () => ({ fuente, resuelto, esDemo, activo, vistaVisible, refrescar }),
    [fuente, resuelto, esDemo, activo, vistaVisible, refrescar],
  )
}
