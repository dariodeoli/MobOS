import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

// Menú de tres puntos del POS (#228): solo accesos de uso, corto y predecible.
// Lo que es configuración vive en Configuración (también Preferencias); el tema
// y el cierre de sesión quedan donde ya estaban (barra superior y menú lateral),
// y Eliminar cuenta vive en Configuración → Seguridad (nunca a un toque).
const ITEMS = [
  ['Configuración', 'settings', 'equipo', ''],
  ['Caja', 'wallet', 'finanzas', ''],
  ['Análisis', 'chart', 'analisis', ''],
  ['Clientes', 'user', 'clientes', ''],
  ['Bloquear pantalla', 'lock', 'bloquear', ''],
]

export default function MenuAcciones({ onNavegar, onBloquear }) {
  const [abierto, setAbierto] = useState(false)
  const cajaRef = useRef(null)

  useEffect(() => {
    if (!abierto) return undefined
    const alClic = (event) => { if (!cajaRef.current?.contains(event.target)) setAbierto(false) }
    const alTecla = (event) => { if (event.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', alClic)
    document.addEventListener('keydown', alTecla)
    return () => {
      document.removeEventListener('mousedown', alClic)
      document.removeEventListener('keydown', alTecla)
    }
  }, [abierto])

  function accion(destino) {
    setAbierto(false)
    if (destino === 'bloquear') { onBloquear?.(); return }
    if (destino === 'finanzas') { onNavegar?.('finanzas', { subtab: 'caja' }); return }
    if (destino === 'analisis') { onNavegar?.('analisis', { subtab: 'reportes' }); return }
    onNavegar?.(destino)
  }

  return (
    <div className="relative" ref={cajaRef}>
      <button
        type="button"
        data-testid="menu-acciones"
        onClick={() => setAbierto(value => !value)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label="Más acciones"
        title="Más acciones"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-mute transition hover:bg-ink-700 hover:text-fore"
      >
        <Icon name="dots" className="h-4 w-4" />
      </button>

      {abierto && (
        <div
          role="menu"
          data-testid="menu-acciones-lista"
          className="absolute right-0 z-30 mt-1 w-60 overflow-hidden rounded-xl border border-ink-600 bg-ink p-1 shadow-float"
        >
          {ITEMS.map(([etiqueta, icono, destino, tono]) => (
            <button
              key={etiqueta}
              type="button"
              role="menuitem"
              onClick={() => accion(destino)}
              className={cn('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-ink-700', tono || 'text-fore')}
            >
              <Icon name={icono} className="h-4 w-4 text-mute" />
              {etiqueta}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
