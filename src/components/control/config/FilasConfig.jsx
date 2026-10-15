import Icon from '@/components/shared/Icon'
import Switch from '@/components/shared/Switch'
import { Card } from '@/components/ui'
import { cn } from '@/lib/utils'

// #422 · Patrón de filas de Configuración (estilo admin de Shopify): una
// tarjeta por grupo y, dentro, filas con ícono · título · descripción y la
// acción a la derecha («›», un valor, un botón o un interruptor). Un solo
// objeto para todas las secciones: así el ritmo visual, el toque de 44 px y el
// ancla del buscador de ajustes (`data-config-anchor`) salen iguales en todas.

// Tarjeta de un grupo de filas. `titulo` es opcional (muchos grupos van sin
// encabezado, como en la referencia).
export function GrupoConfig({ titulo, descripcion, anchor, testId, children, className, ...resto }) {
  return (
    <Card data-config-anchor={anchor} data-testid={testId} className={cn('space-y-0 p-0', className)} {...resto}>
      {(titulo || descripcion) && (
        <div className="px-4 pb-1 pt-4">
          {titulo && <h2 className="font-semibold">{titulo}</h2>}
          {descripcion && <p className="mt-0.5 text-sm text-mute">{descripcion}</p>}
        </div>
      )}
      <div className="divide-y divide-ink-600">{children}</div>
    </Card>
  )
}

const FILA = 'flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left'

function Contenido({ icono, titulo, descripcion, peligro }) {
  return (
    <>
      {icono && (
        <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink-700', peligro ? 'text-bad' : 'text-mute')}>
          <Icon name={icono} className="h-4 w-4" aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm font-medium', peligro ? 'text-bad' : 'text-fore')}>{titulo}</span>
        {descripcion && <span className="mt-0.5 block text-xs text-mute">{descripcion}</span>}
      </span>
    </>
  )
}

// Fila de ajuste. Según las props es:
//  - navegable (`onClick` o `href`): toda la fila es un botón/enlace con «›»;
//  - con interruptor (`checked` + `onCambio`): la acción es un Switch;
//  - informativa (`valor` y/o `accion`): texto o control a la derecha.
export function FilaConfig({ icono, titulo, descripcion, valor, accion, onClick, href, externa, checked, onCambio, disabled, peligro, anchor, testId }) {
  const comunes = { 'data-config-anchor': anchor, 'data-testid': testId }
  const lateral = valor != null && valor !== '' ? <span className="max-w-[45%] shrink-0 truncate text-sm text-mute">{valor}</span> : null

  if (typeof onCambio === 'function') {
    return (
      <div className={FILA} {...comunes}>
        <Contenido icono={icono} titulo={titulo} descripcion={descripcion} peligro={peligro} />
        <Switch checked={Boolean(checked)} disabled={disabled} onChange={(event) => onCambio(event.target.checked)} ariaLabel={titulo} />
      </div>
    )
  }

  if (href || onClick) {
    const cuerpo = (
      <>
        <Contenido icono={icono} titulo={titulo} descripcion={descripcion} peligro={peligro} />
        {lateral}
        <Icon name={externa ? 'external' : 'chevron'} className={cn('h-4 w-4 shrink-0 text-mute', !externa && '-rotate-90')} aria-hidden="true" />
      </>
    )
    const clase = cn(FILA, 'transition hover:bg-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono', disabled && 'pointer-events-none opacity-60')
    return href
      ? <a href={href} target={externa ? '_blank' : undefined} rel={externa ? 'noreferrer' : undefined} className={clase} {...comunes}>{cuerpo}</a>
      : <button type="button" onClick={onClick} disabled={disabled} className={clase} {...comunes}>{cuerpo}</button>
  }

  return (
    <div className={FILA} {...comunes}>
      <Contenido icono={icono} titulo={titulo} descripcion={descripcion} peligro={peligro} />
      {lateral}
      {accion}
    </div>
  )
}
