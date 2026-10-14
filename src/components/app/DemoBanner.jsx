import { useState } from 'react'
import { cn } from '@/lib/utils'

const CLAVE = 'mobos:demo-aviso-oculto'

// Aviso de la demo como chip pequeño dentro de la fila del título (#388), no
// como fila propia: se puede ocultar por sesión. «Cómo funciona» y «Ocultar»
// son enlaces de texto en línea; «Salir» es el único botón táctil.
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
      title="Modo demo: datos ficticios, no se guardan y se descartan al recargar."
      className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-ink-600 bg-ink-800 pl-3 text-xs leading-4 text-mute"
    >
      <span className="shrink-0 font-semibold text-fore">Demo</span>
      <span className="hidden min-w-0 truncate md:inline">datos ficticios, no se guardan</span>
      <span className="flex shrink-0 items-center gap-2">
        {onSalir && (
          <button
            type="button"
            data-testid="demo-salir"
            onClick={onSalir}
            className="inline-flex min-h-11 min-w-14 items-center justify-center rounded-full bg-bad px-3 text-xs font-semibold text-onbrand hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-bad lg:min-h-7"
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
          className={cn(enlace, 'pr-3')}
        >
          Ocultar
        </button>
      </span>
    </div>
  )
}
