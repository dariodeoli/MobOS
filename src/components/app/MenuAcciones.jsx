import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/shared/Icon'
import { Modal } from '@/components/ui'
import { cn } from '@/lib/utils'

// Menú de tres puntos del POS: accesos directos a Configuración (Equipo), Caja,
// Análisis y Clientes; bloqueo, cambio de sucursal, cierre de sesión,
// eliminación de cuenta y preferencias. El cambio de sucursal usa el catálogo
// de la sesión (el backend ya aplica el alcance por sucursal).
export default function MenuAcciones({ onNavegar, onBloquear, onSalir, onPreferencias, sucursales = [], sucursal, onCambiarSucursal }) {
  const [abierto, setAbierto] = useState(false)
  const [cambiandoSucursal, setCambiandoSucursal] = useState(false)
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

  function accion(callback) {
    setAbierto(false)
    callback?.()
  }

  const ITEMS = [
    ['Configuración', 'settings', () => onNavegar('equipo'), ''],
    ['Caja', 'wallet', () => onNavegar('finanzas', { subtab: 'caja' }), ''],
    ['Análisis', 'chart', () => onNavegar('analisis', { subtab: 'reportes' }), ''],
    ['Clientes', 'user', () => onNavegar('clientes'), ''],
    ['Preferencias', 'sliders', onPreferencias, ''],
    ['Bloquear pantalla', 'lock', onBloquear, ''],
    ['Cambiar sucursal', 'store', () => setCambiandoSucursal(true), ''],
    ['Cerrar sesión', 'logout', onSalir, ''],
    ['Eliminar cuenta', 'trash', () => onNavegar('equipo', { subtab: 'seguridad' }), 'text-bad'],
  ]

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
          className="absolute right-0 z-30 mt-1 w-60 overflow-hidden rounded-xl border border-ink-600 bg-ink p-1 shadow-2xl"
        >
          {ITEMS.map(([etiqueta, icono, callback, tono]) => (
            <button
              key={etiqueta}
              type="button"
              role="menuitem"
              onClick={() => accion(callback)}
              className={cn('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-ink-700', tono || 'text-fore')}
            >
              <Icon name={icono} className="h-4 w-4 text-mute" />
              {etiqueta}
            </button>
          ))}
        </div>
      )}

      <Modal open={cambiandoSucursal} onClose={() => setCambiandoSucursal(false)} title="Cambiar sucursal" size="sm">
        {sucursales.length > 1 ? (
          <div className="space-y-1.5" role="radiogroup" aria-label="Sucursales disponibles">
            <p className="text-sm text-mute">Elegí con qué sucursal vas a operar. Aplica a ventas, stock y caja.</p>
            {sucursales.map(item => (
              <button
                key={item.id}
                type="button"
                role="menuitemradio"
                aria-checked={item.id === sucursal?.id}
                onClick={() => { setCambiandoSucursal(false); onCambiarSucursal?.(item.id) }}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition',
                  item.id === sucursal?.id ? 'border-fono bg-fono/10 text-fono-light' : 'border-ink-600 hover:border-fono/40',
                )}
              >
                <span className="font-semibold">{item.nombre || item.name}</span>
                {item.id === sucursal?.id && <Icon name="check" className="h-4 w-4" />}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-mute">
            {sucursal?.nombre ? `Estás operando en ${sucursal.nombre}.` : 'Esta empresa todavía no tiene sucursales cargadas.'}
            {' '}Cuando haya más de una, vas a poder cambiar desde acá.
          </p>
        )}
      </Modal>
    </div>
  )
}
