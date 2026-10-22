import { useEffect, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { moduloActivoImpresionPro } from '@/lib/impresionPro'
import { leerEstadoModulos } from '@/lib/impresionProCarga'

// ¿Impresión Pro está activa para esta empresa? `listo` es falso hasta saberlo:
// quien imprime espera antes de elegir un diseño. En la demo siempre está activa.
export default function useImpresionPro() {
  const { esDemo, empresa, usuario } = useSesion()
  const [estado, setEstado] = useState(() => (esDemo ? { activo: true, listo: true } : { activo: true, listo: false }))
  const clave = `${empresa?.id || usuario?.tenantId || ''}:${esDemo}`
  useEffect(() => {
    if (esDemo) { setEstado({ activo: true, listo: true }); return undefined }
    let vivo = true
    const leer = () => leerEstadoModulos().then((state) => {
      if (vivo) setEstado({ activo: moduloActivoImpresionPro(state, { esDemo: false }), listo: true })
    })
    leer()
    const actualizar = (event) => {
      if (event?.detail?.modules) setEstado({ activo: moduloActivoImpresionPro(event.detail, { esDemo: false }), listo: true })
      else leer()
    }
    window.addEventListener('mobos:module-store-updated', actualizar)
    return () => { vivo = false; window.removeEventListener('mobos:module-store-updated', actualizar) }
  }, [clave, esDemo])
  return estado
}
