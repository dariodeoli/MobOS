import { useSesion } from '@/lib/sesion'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

// Muestra en qué tienda y sucursal estás parado, y deja cambiar.
// Si hay una sola empresa y una sola sucursal, no ofrece nada que elegir:
// se queda como cartel, para que igual sepas dónde estás cargando.
export default function SelectorSucursal({ className }) {
  const { empresa, empresas, sucursal, sucursales, cambiarSucursal, cambiarEmpresa } = useSesion()
  if (!empresa) return null

  const variasEmpresas = empresas.length > 1
  const variasSucursales = sucursales.length > 1

  if (!variasEmpresas && !variasSucursales) {
    return (
      <div
        className={cn(
          'hidden h-[34px] items-center gap-2 rounded-[9px] border border-fono/30 bg-ink-800 px-3 text-[12.5px] text-mute md:flex',
          className,
        )}
      >
        <Icon name="store" className="h-[15px] w-[15px]" />
        <span className="max-w-[180px] truncate">{sucursal?.nombre || empresa.nombre}</span>
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {variasEmpresas && (
        <select
          value={empresa.id}
          onChange={(e) => cambiarEmpresa(e.target.value)}
          title="Empresa"
          className="h-[34px] max-w-[160px] cursor-pointer rounded-[9px] border border-fono/30 bg-ink-800 px-2.5 text-[12.5px] text-white outline-none focus:border-fono [&>option]:bg-ink-800"
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
          className="h-[34px] max-w-[160px] cursor-pointer rounded-[9px] border border-fono/30 bg-ink-800 px-2.5 text-[12.5px] text-white outline-none focus:border-fono [&>option]:bg-ink-800"
        >
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
