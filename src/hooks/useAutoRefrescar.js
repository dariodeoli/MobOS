import { useEffect } from 'react'
import { refrescar } from '@/lib/storage'

// Mantiene el sistema al día sin recargar la página:
//  - refresca al volver a la pestaña / abrir la app,
//  - refresca cada pocos minutos mientras esté visible,
//  - al refrescar, la vista recalcula "hoy", así el sistema rota de día solo.
export function useAutoRefrescar(ms = 180000) {
  useEffect(() => {
    const segura = () => { Promise.resolve(refrescar()).catch(() => {}) }
    segura()
    const onVisible = () => {
      if (document.visibilityState === 'visible') segura()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', segura)
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') segura()
    }, ms)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', segura)
      clearInterval(id)
    }
  }, [ms])
}
