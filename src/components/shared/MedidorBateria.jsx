import { BarraProgreso, Badge } from '@/components/ui'
import { tonoBateria } from '@/lib/estadoEquipo'
import { cn } from '@/lib/utils'

// Medidor de batería (#240): el % de salud siempre con el mismo color por
// umbral (≥90 bien, 80–89 atención, <80 cambio) y el mismo formato. Variante
// `barra` para la ficha/rack (etiqueta + % + barra) y `chip` para listas y
// tablas (solo el %). Sin dato → `—`, nunca un cero inventado.
const TONOS_TEXTO = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', mute: 'text-mute' }

export default function MedidorBateria({ porcentaje, ciclos, etiqueta = 'Batería', variante = 'barra', compact = false, className }) {
  const hay = porcentaje !== null && porcentaje !== undefined && porcentaje !== '' && Number.isFinite(Number(porcentaje))
  const valor = hay ? Number(porcentaje) : null
  const tono = tonoBateria(hay ? valor : null)
  const texto = hay ? `${valor}%` : '—'
  const title = hay ? `${etiqueta}: ${valor}%${ciclos ? ` · ${ciclos} ciclos` : ''}` : `${etiqueta}: sin dato`

  if (variante === 'chip') {
    return (
      <span className={cn('inline-flex shrink-0 items-center rounded border border-ink-600 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums', TONOS_TEXTO[tono], className)} title={title}>
        {texto}
      </span>
    )
  }

  return (
    <div className={cn('space-y-1', className)} title={title}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn('text-xs text-mute', compact && 'text-[11px]')}>{etiqueta}</span>
        <span className={cn('font-semibold tabular-nums', TONOS_TEXTO[tono], compact && 'text-xs')}>{texto}</span>
      </div>
      {hay
        ? <BarraProgreso valor={valor} tono={tono} alto={compact ? 'sm' : 'md'} pista="bg-ink-700" etiqueta={`${etiqueta} ${valor}%`} />
        : <Badge color="slate">Sin dato</Badge>}
    </div>
  )
}
