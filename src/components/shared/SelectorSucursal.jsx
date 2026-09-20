import { useEffect, useRef, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

// Muestra en qué tienda y sucursal estás parado, y deja cambiar.
// Con una sola empresa y una sola sucursal no hay nada que elegir: se pinta
// como dato informativo, sin botón ni menú. Con más de una opción el control
// abre un menú real (no un <select> muerto).
export default function SelectorSucursal({ className }) {
  const { empresa, empresas, sucursal, sucursales, cambiarSucursal, cambiarEmpresa } = useSesion()
  const [abierto, setAbierto] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setAbierto(false)
    }
    const escape = (event) => {
      if (event.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', escape)
    }
  }, [abierto])

  if (!empresa) return null

  const variasEmpresas = empresas.length > 1
  const variasSucursales = sucursales.length > 1
  const hayEleccion = variasEmpresas || variasSucursales
  // El catálogo de inventario devuelve `name`; la sesión del vendedor, `nombre`.
  const actual = sucursal?.nombre || sucursal?.name || empresa.nombre

  if (!hayEleccion) {
    return (
      <div
        data-testid="sucursal-info"
        className={cn(
          'flex h-[34px] items-center gap-2 rounded-[9px] border border-fono/30 bg-ink-800 px-3 text-[12.5px] text-mute',
          className,
        )}
      >
        <Icon name="store" className="h-[15px] w-[15px]" />
        <span className="hidden max-w-[110px] truncate sm:block sm:max-w-[180px]">{actual}</span>
      </div>
    )
  }

  async function elegirEmpresa(id) {
    if (id === empresa.id) { setAbierto(false); return }
    try {
      await cambiarEmpresa(id)
    } catch {
      // Hoy el backend mantiene una sola empresa por sesión; se conserva la actual.
    }
    setAbierto(false)
  }

  const opcionBase = 'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[12.5px] transition hover:bg-ink-700'

  return (
    <div ref={ref} className={cn('relative flex min-w-0 items-center', className)}>
      <button
        type="button"
        data-testid="sucursal-selector"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={`Tienda o sucursal: ${actual}`}
        title="Tienda o sucursal"
        onClick={() => setAbierto((valor) => !valor)}
        className="flex h-[34px] min-w-0 max-w-[160px] cursor-pointer items-center gap-2 rounded-[9px] border border-fono/30 bg-ink-800 px-2.5 text-[12.5px] text-fore outline-none transition hover:border-fono/60 focus:border-fono"
      >
        <Icon name="store" className="h-[15px] w-[15px] shrink-0 text-mute" />
        <span className={cn('truncate', sucursal ? '' : 'text-mute')}>{sucursal ? actual : 'Elegí sucursal'}</span>
        <Icon name="chevron" className={cn('h-3.5 w-3.5 shrink-0 text-mute transition-transform', abierto && 'rotate-180')} />
      </button>

      {abierto && (
        <div
          data-testid="sucursal-menu"
          role="menu"
          aria-label="Cambiar tienda o sucursal"
          className="absolute right-0 top-[calc(100%+6px)] z-40 max-h-[70dvh] min-w-[190px] max-w-[260px] overflow-y-auto overflow-x-hidden rounded-xl border border-ink-500 bg-ink-800 py-1 shadow-xl"
        >
          {variasEmpresas && (
            <div role="group" aria-label="Empresa">
              <p role="presentation" className="px-3 py-1 text-[10px] font-bold uppercase tracking-[.14em] text-mute">Empresa</p>
              {empresas.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={item.id === empresa.id}
                  onClick={() => elegirEmpresa(item.id)}
                  className={cn(opcionBase, item.id === empresa.id && 'bg-fono/10')}
                >
                  <span className="truncate">{item.nombre}</span>
                  {item.id === empresa.id && <Icon name="check" className="h-3.5 w-3.5 shrink-0 text-fono-light" />}
                </button>
              ))}
            </div>
          )}
          {variasEmpresas && variasSucursales && <div className="my-1 border-t border-ink-600" />}
          {variasSucursales && (
            <div role="group" aria-label="Sucursal">
              <p role="presentation" className="px-3 py-1 text-[10px] font-bold uppercase tracking-[.14em] text-mute">Sucursal</p>
              {sucursales.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={item.id === sucursal?.id}
                  onClick={() => { cambiarSucursal(item.id); setAbierto(false) }}
                  className={cn(opcionBase, item.id === sucursal?.id && 'bg-fono/10')}
                >
                  <span className="truncate">{item.nombre || item.name}</span>
                  {item.id === sucursal?.id && <Icon name="check" className="h-3.5 w-3.5 shrink-0 text-fono-light" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
