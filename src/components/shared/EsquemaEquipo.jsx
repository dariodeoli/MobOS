import { puntosEsquema } from '@/lib/servicioImpresion'

// Esquema del equipo para la recepción en pantalla: el mismo dibujo y la misma
// numeración que la hoja impresa, pero cada punto se toca para marcarlo como
// revisado (queda guardado en el checklist de la orden).
export default function EsquemaEquipo({ tipo = 'iPhone', marcados = {}, onToggle, disabled = false }) {
  const puntos = puntosEsquema(tipo)

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <svg viewBox="0 0 150 150" className="h-40 w-40 rounded-xl border border-ink-600 bg-ink-800" role="group" aria-label={`Esquema del equipo: ${puntos.length} puntos para revisar`}>
        <rect x="46" y="10" width="58" height="120" rx="12" fill="none" stroke="currentColor" strokeWidth="2" className="text-mute/70" />
        <rect x="52" y="20" width="46" height="96" rx="4" fill="none" stroke="currentColor" strokeWidth="1" className="text-mute/50" />
        <rect x="62" y="13" width="26" height="4" rx="2" fill="currentColor" className="text-mute/70" />
        <circle cx="75" cy="124" r="4" fill="none" stroke="currentColor" strokeWidth="1" className="text-mute/70" />
        {puntos.map(({ numero, etiqueta, x, y }) => {
          const activo = marcados[etiqueta] === true
          return (
            <g
              key={etiqueta}
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-label={`${numero}. ${etiqueta}${activo ? ' (revisado)' : ''}`}
              aria-pressed={activo}
              onClick={() => !disabled && onToggle?.(etiqueta)}
              onKeyDown={(event) => { if (!disabled && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onToggle?.(etiqueta) } }}
              className={disabled ? 'cursor-default' : 'cursor-pointer'}
            >
              <title>{`${numero}. ${etiqueta}`}</title>
              <circle cx={x} cy={y} r="7" fill={activo ? 'var(--fono, #05f19c)' : 'var(--ink-800, #101820)'} stroke={activo ? 'var(--fono, #05f19c)' : 'currentColor'} strokeWidth="1.5" />
              <text x={x} y={y + 3} textAnchor="middle" fontSize="8" fontFamily="Arial" fill={activo ? '#052012' : 'currentColor'} className={activo ? '' : 'text-mute'}>{numero}</text>
            </g>
          )
        })}
      </svg>
      <span className="text-[10px] text-mute">{Object.values(marcados).filter(Boolean).length} de {puntos.length} revisados</span>
    </div>
  )
}
