import Icon from '@/components/shared/Icon'
import SegmentedField from '@/components/shared/SegmentedField'
import { InsigniaProveedor } from '@/components/inventory/FichaUnidadBloques'
import { ROTULO_SECCION } from '@/components/shared/tabla'
import { COLORES_PROVEEDOR, ICONOS_PROVEEDOR, MODOS_PROVEEDOR } from '@/lib/proveedorIdentidad'
import { cn } from '@/lib/utils'

// Identidad del proveedor en su ficha (#400): monograma/ícono, color y modo de
// visualización. Solo lo edita administración/gerencia (la API lo exige). El
// vendedor y la caja ven siempre la sigla con este ícono y color, nunca el nombre.
export default function IdentidadProveedor({ valor, onChange, disabled = false }) {
  const icono = valor.icon || ''
  const color = valor.color || ''
  const modo = valor.displayMode || 'ABREVIADO'
  const cambiar = (parche) => onChange({ ...valor, ...parche })
  return (
    <fieldset className="space-y-3 rounded-xl border border-ink-600 p-3" disabled={disabled} data-testid="proveedor-identidad">
      <legend className={cn('px-1', ROTULO_SECCION)}>Identidad</legend>
      <div className="flex flex-wrap items-center gap-3">
        <InsigniaProveedor sigla={valor.code || 'S/S'} color={color} icono={icono} nombre={valor.name} />
        <p className="text-xs text-mute">Así lo reconocen en la planilla de unidades y en la ficha.</p>
      </div>
      <div>
        <p className="mb-1 text-xs text-mute">Ícono</p>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Ícono del proveedor">
          <button type="button" role="radio" aria-checked={!icono} onClick={() => cambiar({ icon: '' })} className={cn('toque-44 inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-[10px] font-bold uppercase transition', !icono ? 'border-fono bg-fono/15 text-fono-light' : 'border-ink-600 text-mute hover:border-fono/40')} title="Monograma con la sigla">Aa</button>
          {ICONOS_PROVEEDOR.map(clave => (
            <button key={clave} type="button" role="radio" aria-checked={icono === clave} aria-label={`Ícono ${clave.toLowerCase()}`} onClick={() => cambiar({ icon: clave })} className={cn('toque-44 inline-flex h-9 w-9 items-center justify-center rounded-lg border transition', icono === clave ? 'border-fono bg-fono/15 text-fono-light' : 'border-ink-600 text-mute hover:border-fono/40')}>
              <Icon name={clave.toLowerCase()} className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs text-mute">Color</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Color del proveedor">
          <button type="button" role="radio" aria-checked={!color} onClick={() => cambiar({ color: '' })} className={cn('toque-44 inline-flex h-9 items-center rounded-lg border px-2 text-[10px] font-semibold transition', !color ? 'border-fono bg-fono/15 text-fono-light' : 'border-ink-600 text-mute hover:border-fono/40')}>Automático</button>
          {COLORES_PROVEEDOR.map(hex => (
            <button key={hex} type="button" role="radio" aria-checked={color === hex} aria-label={`Color ${hex}`} onClick={() => cambiar({ color: hex })} className={cn('toque-44 inline-flex h-9 w-9 items-center justify-center rounded-lg border transition', color === hex ? 'border-fono ring-2 ring-fono/40' : 'border-ink-600 hover:border-fono/40')}>
              <span className="h-5 w-5 rounded-md" style={{ backgroundColor: hex }} />
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs text-mute">Cómo se muestra</p>
        <SegmentedField value={modo} onChange={(next) => cambiar({ displayMode: next })} ariaLabel="Cómo se muestra el proveedor" options={MODOS_PROVEEDOR} />
        <p className="mt-1 text-[11px] text-mute">{modo === 'COMPLETO' ? 'Administración y gerencia ven el nombre completo; el resto, solo la sigla.' : 'Se muestra la sigla (por defecto). El nombre completo queda para administración y gerencia.'}</p>
      </div>
    </fieldset>
  )
}
