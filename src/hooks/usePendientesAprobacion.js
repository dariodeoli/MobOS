import { useEffect } from 'react'
import { api } from '@/lib/api'
import { claveBadge, publicarBadgePestana } from '@/lib/badgesPestanas'
import { puedeVerificarPagos } from '@/lib/verificacionPagos'
import { demoCantidadPagosPendientes } from '@/lib/demoVerificacionPagos'
import { demoAutorizacionesFiltradas } from '@/lib/demoAutorizaciones'
import { autorizacionesCreditoDemo } from '@/lib/demoCreditoStore'

export const CLAVE_BADGE_AUTORIZACIONES = claveBadge('pedidos', 'autorizaciones')
const CADA_MS = 60000

// Contador de «Por aprobar» en el menú: pagos por verificar + autorizaciones
// comerciales pendientes que esta persona puede resolver. Se revisa cada minuto
// y al volver a la pestaña; la pantalla de Autorizaciones lo actualiza al instante.
export function usePendientesAprobacion({ rol, esDemo = false, activo = true } = {}) {
  useEffect(() => {
    if (!activo || !puedeVerificarPagos(rol)) {
      publicarBadgePestana(CLAVE_BADGE_AUTORIZACIONES, 0)
      return undefined
    }
    let vigente = true
    async function cargar() {
      try {
        if (esDemo) {
          const comerciales = [...autorizacionesCreditoDemo(), ...demoAutorizacionesFiltradas('PENDING', '')].filter(fila => fila.status === 'PENDING').length
          if (vigente) publicarBadgePestana(CLAVE_BADGE_AUTORIZACIONES, comerciales + demoCantidadPagosPendientes())
          return
        }
        const [pagos, comerciales] = await Promise.all([
          api.get('/api/payments/verification?state=pending&limit=1', { cacheMs: 0 }).then(datos => datos?.counts?.pending?.count ?? 0).catch(() => 0),
          rol === 'CAJERA' ? 0 : api.get('/api/authorizations?status=PENDING', { cacheMs: 0 }).then(filas => (Array.isArray(filas) ? filas.length : 0)).catch(() => 0),
        ])
        if (vigente) publicarBadgePestana(CLAVE_BADGE_AUTORIZACIONES, pagos + comerciales)
      } catch { /* sin red: queda el último valor */ }
    }
    cargar()
    const intervalo = window.setInterval(() => { if (document.visibilityState === 'visible') cargar() }, CADA_MS)
    const alVolver = () => { if (document.visibilityState === 'visible') cargar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      vigente = false
      window.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', alVolver)
      publicarBadgePestana(CLAVE_BADGE_AUTORIZACIONES, 0)
    }
  }, [rol, esDemo, activo])
}
