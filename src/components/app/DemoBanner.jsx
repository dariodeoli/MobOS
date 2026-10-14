import { useState } from 'react'
import { cn } from '@/lib/utils'

const CLAVE = 'mobos:demo-aviso-oculto'

// Aviso de la demo en una sola línea y dentro del flujo (no fijo): se puede
// ocultar por sesión. Los dos controles son enlaces de texto en línea.
export default function DemoBanner({ angosta = false, onComoFunciona, onSalir }) {
  const [oculto, setOculto] = useState(() => {
    try {
      return sessionStorage.getItem(CLAVE) === '1'
    } catch {
      return false
    }
  })
  if (oculto) return null
  const ocultar = () => {
    try {
      sessionStorage.setItem(CLAVE, '1')
    } catch {
      /* sin storage: se oculta solo hasta recargar */
    }
    setOculto(true)
  }
  const enlace = 'toque-44 shrink-0 underline underline-offset-2 hover:text-fore'
  return (
    <div
      role="status"
      data-testid="demo-aviso"
      className={cn(
        'flex items-center justify-between gap-3 border-b border-ink-600 bg-ink px-4 text-mute md:px-6',
        angosta ? 'h-5 text-[11px] leading-[14px]' : 'h-6 text-xs leading-4',
      )}
    >
      <span className="min-w-0 truncate">
        {angosta
          ? 'Demo: datos ficticios, nada se guarda.'
          : 'Modo demo: datos ficticios, no se guardan y se descartan al recargar.'}
      </span>
      <span className="flex shrink-0 items-center gap-3">
        {onSalir && (
          <button
            type="button"
            data-testid="demo-salir"
            onClick={onSalir}
            className="inline-flex min-h-11 items-center rounded-lg bg-bad px-3 text-xs font-semibold text-onbrand hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-bad"
          >
            {angosta ? 'Salir' : 'Salir de la demo'}
          </button>
        )}
        <button
          type="button"
          data-testid="demo-como-funciona"
          data-inline-link
          onClick={onComoFunciona}
          className={enlace}
        >
          Cómo funciona
        </button>
        <button
          type="button"
          data-testid="demo-aviso-ocultar"
          data-inline-link
          onClick={ocultar}
          className={enlace}
        >
          Ocultar
        </button>
      </span>
    </div>
  )
}
