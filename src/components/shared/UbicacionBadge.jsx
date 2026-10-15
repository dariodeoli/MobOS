import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

// Ubicación en una pastilla: ícono + sigla, con el nombre largo en el tooltip
// (#400). La usan la planilla de Unidades y, más adelante, la ficha de unidad.
// Set fijo de íconos de StockLocation.icon (backend/lib/unit-code.ts).
export const ICONOS_UBICACION = Object.freeze({
  DEPOSITO: 'archive',
  VITRINA: 'store',
  CAJA_FUERTE: 'lock',
  TALLER: 'wrench',
  TRANSITO: 'truck',
  PRESTAMO: 'transfer',
})

const HEX = /^#[0-9a-fA-F]{6}$/

/**
 * @param {{ sigla?: string, nombre?: string, sucursal?: string, sucursalSigla?: string, modo?: 'abrev'|'nombre'|'icono', icono?: string|null, color?: string|null, className?: string }} props
 *   `color` es el color propio de la ubicación (#rrggbb): solo pinta el punto/ícono, el texto sigue en el color de la app.
 *   `modo` (#466): `abrev` = «VIL · DEP-VM» (sigla de sucursal si se pasa), `nombre` = sucursal y depósito completos, `icono` = solo el ícono (el nombre va en el tooltip).
 */
export default function UbicacionBadge({ sigla = '', nombre = '', sucursal = '', sucursalSigla = '', modo = 'abrev', icono = null, color = null, className }) {
  const nombreIcono = ICONOS_UBICACION[String(icono || '').toUpperCase()]
  const corto = sigla || nombre.slice(0, 3).toUpperCase()
  const texto = modo === 'nombre'
    ? [sucursal, nombre].filter(Boolean).join(' · ') || corto
    : modo === 'abrev' && sucursalSigla ? [sucursalSigla, corto].filter(Boolean).join(' · ') : corto
  const titulo = [nombre || sigla, sucursal].filter(Boolean).join(' · ') || 'Sin ubicación'
  if (!texto) return <span className={cn('text-xs text-mute', className)} title="Sin ubicación">—</span>
  return (
    <span data-testid="ubicacion-badge" title={titulo} className={cn('inline-flex max-w-full min-w-0 items-center gap-1 text-[11px] font-semibold leading-none', className)}>
      {nombreIcono
        ? <Icon name={nombreIcono} className="h-3 w-3 shrink-0" aria-hidden="true" style={HEX.test(String(color || '')) ? { color } : undefined} />
        : <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full border border-current/40" style={{ background: HEX.test(String(color || '')) ? color : 'currentColor' }} />}
      {modo === 'icono' && nombreIcono ? null : <span className="truncate">{texto}</span>}
      <span className="sr-only">{`, ${titulo}`}</span>
    </span>
  )
}
