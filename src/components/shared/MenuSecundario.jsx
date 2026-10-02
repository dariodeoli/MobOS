import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/shared/Icon'

// #307: menú secundario para agrupar acciones que no son la primaria (las
// etiquetas tienen una sola acción principal y el resto acá). Abre hacia
// arriba: así el scroll de un modal no lo recorta. Cierra al elegir una acción,
// al hacer clic afuera o con Escape.
export default function MenuSecundario({ acciones = [], etiqueta = 'Más acciones', ariaLabel = 'Más acciones' }) {
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef(null)
  useEffect(() => {
    if (!abierto) return undefined
    const cerrarFuera = (event) => {
      if (event.target instanceof Node && raiz.current?.contains(event.target)) return
      setAbierto(false)
    }
    const cerrarEscape = (event) => { if (event.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', cerrarFuera)
    document.addEventListener('keydown', cerrarEscape)
    return () => { document.removeEventListener('mousedown', cerrarFuera); document.removeEventListener('keydown', cerrarEscape) }
  }, [abierto])
  return (
    <span ref={raiz} className="relative inline-flex">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((valor) => !valor)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-mute transition hover:border-fono/40 hover:text-fore md:min-h-0"
      >
        <Icon name="dots" className="h-4 w-4" />{etiqueta}
      </button>
      {abierto && (
        <span role="menu" aria-label={ariaLabel} className="absolute bottom-full right-0 z-30 mb-1 w-56 rounded-xl border border-ink-500 bg-paper p-1 shadow-xl">
          {acciones.map((accion, indice) => accion.separador
            ? <span key={`separador-${indice}`} className="my-1 block h-px bg-ink-600" />
            : (
              <button
                key={accion.label}
                type="button"
                role="menuitem"
                disabled={accion.disabled}
                onClick={() => { setAbierto(false); accion.onClick?.() }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-fore transition hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {accion.icon && <Icon name={accion.icon} className="h-4 w-4 shrink-0 text-mute" />}
                <span className="min-w-0 flex-1 truncate">{accion.label}</span>
              </button>
            ))}
        </span>
      )}
    </span>
  )
}
