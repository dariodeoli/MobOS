import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

// Proveedor como sigla + ícono/color (#400). Vendedores y caja ven solo esto: el
// nombre real llega solo a ADMIN/GERENTE y recién ahí se muestra en el tooltip
// (`nombre`). Si no se pasa `nombre`, el tooltip repite la sigla: nunca inventa
// un dato que el rol no tiene.
// El ícono es un identificador corto del set del front (Supplier.icon).
export const ICONOS_PROVEEDOR = Object.freeze({
  CAMION: 'truck', TRUCK: 'truck',
  TIENDA: 'store', STORE: 'store',
  EDIFICIO: 'building', BUILDING: 'building',
  CAJA: 'package', BOX: 'package', PACKAGE: 'package',
  GLOBO: 'globe', GLOBE: 'globe',
  PERSONA: 'user', USER: 'user',
  ESTRELLA: 'sparkles', STAR: 'sparkles',
  CELULAR: 'phone', PHONE: 'phone',
})

const HEX = /^#[0-9a-fA-F]{6}$/

/**
 * @param {{ sigla?: string|null, icono?: string|null, color?: string|null, nombre?: string|null, className?: string }} props
 */
export default function ProveedorBadge({ sigla = '', icono = null, color = null, nombre = null, className }) {
  const texto = String(sigla || '').trim()
  if (!texto) return <span className={cn('text-xs text-mute', className)} title="Sin proveedor">—</span>
  const nombreIcono = ICONOS_PROVEEDOR[String(icono || '').toUpperCase()]
  const propio = HEX.test(String(color || '')) ? color : null
  const titulo = nombre && nombre !== texto ? `${texto} · ${nombre}` : texto
  return (
    <span data-testid="proveedor-badge" title={titulo} className={cn('inline-flex max-w-full min-w-0 items-center gap-1 text-[11px] font-semibold leading-none', className)}>
      {nombreIcono
        ? <Icon name={nombreIcono} className="h-3 w-3 shrink-0" aria-hidden="true" style={propio ? { color: propio } : undefined} />
        : <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-sm" style={{ background: propio || 'currentColor' }} />}
      <span className="truncate">{texto}</span>
    </span>
  )
}
