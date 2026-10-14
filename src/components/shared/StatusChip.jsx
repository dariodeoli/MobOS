import { estadoInfo } from '@/lib/estados'
import { cn } from '@/lib/utils'

// Chip de estado único (docs/PANTALLAS.md regla 10): etiqueta y tono salen de
// `lib/estados.js`. Familia de TEXTO `*-text` (≥ 4.5:1 en claro y oscuro),
// `w-fit` para no estirarse en columnas flex/grid y `whitespace-nowrap` para
// que la etiqueta no parta. El estado se muestra UNA vez por fila.
export const CLASES_TONO = {
  ok: 'border-ok/30 bg-ok/10 text-ok-text',
  warn: 'border-warn/30 bg-warn/10 text-warn-text',
  bad: 'border-bad/30 bg-bad/10 text-bad-text',
  neutral: 'border-ink-600 bg-ink-800 text-mute',
}

export default function StatusChip({ estado, dominio = 'general', etiqueta, tono, className, testId }) {
  const info = estadoInfo(estado, dominio)
  const tonoFinal = CLASES_TONO[tono] ? tono : info.tono
  const texto = etiqueta || info.label
  return (
    <span
      data-testid={testId}
      data-tono={tonoFinal}
      title={texto}
      className={cn('inline-flex w-fit max-w-full items-center whitespace-nowrap rounded-lg border px-2 py-0.5 text-xs font-semibold leading-4', CLASES_TONO[tonoFinal], className)}
    >
      <span className="truncate">{texto}</span>
    </span>
  )
}
