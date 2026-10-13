import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/shared/Icon'

// Menú de acciones de la fila: íconos con tooltip, se cierra al elegir o al
// hacer clic afuera.
export function MenuAcciones({ unit, busy, acciones }) {
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef(null)
  const trigger = useRef(null)
  useEffect(() => {
    if (abierto) raiz.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus()
  }, [abierto])
  const closeMenu = () => {
    setAbierto(false)
    trigger.current?.focus()
  }
  const handleMenuKey = (event) => {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu()
      return
    }
    if (event.key === 'Tab') {
      closeMenu()
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const items = [...raiz.current.querySelectorAll('[role="menuitem"]:not(:disabled)')]
    const index = items.indexOf(document.activeElement)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
    items[next]?.focus()
  }
  useEffect(() => {
    if (!abierto) return undefined
    // Solo cierra si el clic fue afuera: cerrar con cualquier `mousedown`
    // desmontaba el menú antes del `click` y ninguna acción respondía.
    const cerrar = (event) => {
      if (event.target instanceof Node && raiz.current?.contains(event.target)) return
      setAbierto(false)
    }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [abierto])
  if (!acciones.length) return null
  return (
    <span
      ref={raiz}
      className="stock-f4-menu relative"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={handleMenuKey}
    >
      <button
        ref={trigger}
        type="button"
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={`Acciones de ${unit.serial}`}
        title="Más acciones"
        onClick={() => setAbierto((valor) => !valor)}
        className="grid h-11 w-11 place-items-center rounded-lg border border-ink-600 text-mute transition hover:border-fono/40 hover:text-fore"
      >
        <Icon name="dots" className="h-3.5 w-3.5" />
      </button>
      {abierto && (
        <span
          role="menu"
          aria-label={`Acciones de ${unit.serial}`}
          className="absolute right-0 top-full z-30 mt-1 w-56 rounded-xl border border-ink-500 bg-paper p-1 shadow-xl"
        >
          {acciones.map((accion) => (
            <button
              key={accion.label}
              role="menuitem"
              type="button"
              disabled={busy || accion.disabled}
              title={accion.tooltip}
              onClick={() => {
                closeMenu()
                accion.run()
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-fore transition hover:bg-ink-700 disabled:opacity-40"
            >
              <Icon name={accion.icon} className="h-3.5 w-3.5 shrink-0 text-mute" />
              <span className="min-w-0 flex-1 truncate">{accion.label}</span>
              {accion.hint && <span className="shrink-0 text-[10px] text-mute">{accion.hint}</span>}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}
