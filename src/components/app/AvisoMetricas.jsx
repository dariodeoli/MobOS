import { X } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { medicionDesactivada } from '@/lib/trafico'

// Aviso breve y descartable (no bloquea ni pide consentimiento): se muestra
// una vez en la landing; al cerrarlo se recuerda en localStorage. La demo tiene
// su propia divulgación de datos ficticios en DemoAccess.
// No aparece si el navegador ya pide no ser rastreado o si eligió «No medir».
export const CLAVE_AVISO_METRICAS = 'mobos:aviso-metricas'

function visible(soloDemo) {
  try {
    // DemoAccess ya divulga que usa datos ficticios; evita duplicar el aviso y
    // reservar espacio en una pantalla diseñada para entrar sin scroll.
    if (soloDemo) return false
    if (medicionDesactivada()) return false
    return localStorage.getItem(CLAVE_AVISO_METRICAS) !== '1'
  } catch {
    return false
  }
}

export default function AvisoMetricas({ soloDemo = false }) {
  const [abierto, setAbierto] = useState(() => visible(soloDemo))
  const avisoRef = useRef(null)
  useLayoutEffect(() => {
    if (!abierto || !avisoRef.current) return undefined
    const body = document.body
    const html = document.documentElement
    const paddingAnterior = body.style.paddingBottom
    const scrollPaddingHtmlAnterior = html.style.scrollPaddingBottom
    const reservarEspacio = () => {
      const alto = avisoRef.current?.getBoundingClientRect().height || 0
      body.style.paddingBottom = `${alto}px`
      html.style.scrollPaddingBottom = `${alto}px`
    }
    reservarEspacio()
    const observer = new ResizeObserver(reservarEspacio)
    observer.observe(avisoRef.current)
    window.addEventListener('resize', reservarEspacio)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', reservarEspacio)
      body.style.paddingBottom = paddingAnterior
      html.style.scrollPaddingBottom = scrollPaddingHtmlAnterior
    }
  }, [abierto])
  if (!abierto) return null
  const cerrar = () => {
    try {
      localStorage.setItem(CLAVE_AVISO_METRICAS, '1')
    } catch {
      /* sin storage */
    }
    setAbierto(false)
  }
  return (
    <div
      role="region"
      aria-label="Aviso de privacidad"
      data-testid="aviso-metricas"
      ref={avisoRef}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="pointer-events-auto flex w-full max-w-xl flex-col items-stretch gap-1 rounded-xl border border-fore/[.12] bg-paper py-2 pl-4 pr-2 text-xs text-mute shadow-lg sm:flex-row sm:items-center sm:py-1 sm:pr-1">
        <p className="min-w-0 flex-1 py-1.5">
          Usamos métricas anónimas para mejorar MobOS. Sin datos personales.
        </p>
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <a
            href="/privacidad"
            className="inline-flex min-h-11 items-center font-semibold text-fono-dark underline underline-offset-2"
          >
            Más info
          </a>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar aviso"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-mute transition hover:text-fore"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
