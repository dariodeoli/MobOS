import { useEffect, useRef, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

// Muestra en qué tienda y sucursal estás parado, y deja cambiar.
// Con una sola empresa y sucursal no hay nada que elegir, pero el control igual
// abre su panel: así nunca se siente un dropdown muerto (#58).
export default function SelectorSucursal({ className }) {
  const { empresa, empresas, sucursal, sucursales, cambiarSucursal, cambiarEmpresa } = useSesion()
  const [abierto, setAbierto] = useState(false)
  const caja = useRef(null)

  useEffect(() => {
    if (!abierto) return undefined
    const cerrar = (event) => { if (!caja.current?.contains(event.target)) setAbierto(false) }
    const escape = (event) => { if (event.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', cerrar)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', cerrar)
      document.removeEventListener('keydown', escape)
    }
  }, [abierto])

  if (!empresa) return null

  const variasEmpresas = empresas.length > 1
  const variasSucursales = sucursales.length > 1
  const etiqueta = sucursal?.nombre || empresa.nombre

  return (
    <div className={cn('relative', className)} ref={caja}>
      {!variasEmpresas && !variasSucursales ? (
        <button
          type="button"
          onClick={() => setAbierto((actual) => !actual)}
          aria-expanded={abierto}
          aria-haspopup="dialog"
          title="Tienda y sucursal"
          className="flex h-[34px] items-center gap-2 rounded-[9px] border border-fono/30 bg-ink-800 px-3 text-[12.5px] text-mute transition hover:border-fono/60 hover:text-fore"
        >
          <Icon name="store" className="h-[15px] w-[15px]" />
          <span className="max-w-[110px] truncate sm:max-w-[180px]">{etiqueta}</span>
          <Icon name="chevron" className={cn('h-3 w-3 transition', abierto && 'rotate-180')} />
        </button>
      ) : (
        <div className="flex items-center gap-1.5">
          {variasEmpresas && (
            <select
              value={empresa.id}
              onChange={(e) => cambiarEmpresa(e.target.value)}
              title="Empresa"
              className="h-[34px] max-w-[160px] cursor-pointer rounded-[9px] border border-fono/30 bg-ink-800 px-2.5 text-[12.5px] text-fore outline-none focus:border-fono [&>option]:bg-ink-800"
            >
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          )}
          {variasSucursales && (
            <select
              value={sucursal?.id || ''}
              onChange={(e) => cambiarSucursal(e.target.value)}
              title="Sucursal"
              className="h-[34px] max-w-[160px] cursor-pointer rounded-[9px] border border-fono/30 bg-ink-800 px-2.5 text-[12.5px] text-fore outline-none focus:border-fono [&>option]:bg-ink-800"
            >
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {abierto && !variasEmpresas && !variasSucursales && (
        <div role="dialog" aria-label="Tienda y sucursal" className="absolute right-0 top-[calc(100%+6px)] z-40 w-64 rounded-xl border border-ink-500 bg-paper p-3 text-left shadow-xl">
          <p className="text-[11px] font-bold uppercase tracking-wider text-mute">Estás cargando en</p>
          <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-fore"><Icon name="store" className="h-4 w-4 text-mute" />{empresa.nombre}</p>
          <p className="mt-0.5 text-xs text-mute">{sucursal?.nombre || 'Sin sucursal asignada'}</p>
          <p className="mt-2 border-t border-ink-700 pt-2 text-[11px] text-mute">
            {sucursal ? 'Es la única sucursal de la tienda: no hay otra para elegir.' : 'Tu usuario no tiene sucursal asignada.'}
          </p>
        </div>
      )}
    </div>
  )
}
