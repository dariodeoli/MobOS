import Icon from '@/components/shared/Icon'

/**
 * Resultado elegido para selectores de personas, proveedores y equipos.
 * Mantiene una sola acción visible por estado y deja el cambio/eliminado con
 * targets táctiles de 44px, sin imponer la semántica del formulario padre.
 */
export default function SelectorResultadoCompacto({
  nombre,
  detalles = [],
  detallesCompletos = [],
  chips = [],
  onCambiar,
  onQuitar,
  etiquetaCambiar = 'Cambiar',
  etiquetaQuitar = 'Quitar',
  testId = 'selector-resultado-compacto',
  className = '',
  datosCompletosEnMovil = false,
}) {
  const hasMetadata = detalles.some(Boolean) || chips.some(Boolean)

  return (
    <div data-testid={testId} tabIndex={-1} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCambiar?.() } }} className={`selector-resultado-compacto flex min-h-11 min-w-0 max-w-full items-center gap-2 rounded-xl border border-ink-500 bg-ink-800/50 px-2.5 py-2 ${datosCompletosEnMovil ? 'max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-y-0' : ''} ${className}`}>
      <div className={`w-0 min-w-0 max-w-full flex-1 md:flex md:items-baseline md:gap-2 ${datosCompletosEnMovil ? 'max-md:contents' : ''}`}>
        <p title={nombre || undefined} className={`min-w-0 max-w-full overflow-hidden text-sm font-semibold text-fore text-ellipsis whitespace-nowrap ${hasMetadata ? 'md:max-w-[42%]' : ''}`}>{nombre || '—'}</p>
        {hasMetadata && <div className={`mt-0.5 flex min-w-0 flex-1 items-center gap-x-2 gap-y-0.5 text-xs text-mute md:mt-0 ${datosCompletosEnMovil ? 'max-md:col-span-2 max-md:mt-0' : 'flex-wrap'}`}>
          {detalles.filter(Boolean).map((detalle, index) => <span key={`detalle-${index}`} title={detalle} className={`min-w-0 max-w-[10rem] truncate whitespace-nowrap ${detallesCompletos.includes(detalle) ? 'shrink-0' : 'shrink'}`}>{detalle}</span>)}
          {chips.filter(Boolean).map((chip, index) => <span key={`chip-${index}`} className="rounded-full border border-fono/30 bg-fono/10 px-1.5 py-0.5 font-medium text-fono-light">{chip}</span>)}
        </div>}
      </div>
      <div className={`flex shrink-0 items-center gap-0.5 ${datosCompletosEnMovil ? 'max-md:col-start-2 max-md:row-start-1' : ''}`}>
        {onCambiar && <button type="button" aria-label={etiquetaCambiar} title={etiquetaCambiar} onClick={onCambiar} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-mute transition hover:bg-ink-700 hover:text-fore focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono">
          <Icon name="edit" className="h-4 w-4" />
        </button>}
        {onQuitar && <button type="button" aria-label={etiquetaQuitar} title={etiquetaQuitar} onClick={onQuitar} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-mute transition hover:bg-ink-700 hover:text-bad focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono">
          <Icon name="close" className="h-4 w-4" />
        </button>}
      </div>
    </div>
  )
}
