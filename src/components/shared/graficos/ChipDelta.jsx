import { cn } from '@/lib/utils'

// Chip de variación: «▲ +12,3% vs semana pasada». El signo y la flecha llevan
// el significado además del color. Sin base de comparación no se dibuja: no se
// inventa un porcentaje.
export default function ChipDelta({ valor, comparado = 'vs período anterior', invertido = false, className }) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return null
  const sube = valor > 0
  const igual = Math.abs(valor) < 0.05
  const bueno = invertido ? !sube : sube
  const texto = `${igual ? '' : sube ? '+' : '−'}${Math.abs(valor).toFixed(1).replace('.', ',')}%`
  const accion = igual ? 'Sin cambios' : sube ? 'Subió' : 'Bajó'
  return (
    <span
      data-testid="chip-delta"
      aria-label={`${accion} ${Math.abs(valor).toFixed(1).replace('.', ',')}% ${comparado}`}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium leading-4',
        igual ? 'bg-ink-700 text-mute' : bueno ? 'bg-ok/10 text-ok-text' : 'bg-bad/10 text-bad-text',
        className,
      )}
    >
      <span aria-hidden="true">{igual ? '•' : sube ? '▲' : '▼'}</span>
      <span className="tabular-nums" aria-hidden="true">{texto}</span>
      {comparado && <span className="truncate font-normal text-mute" aria-hidden="true">{comparado}</span>}
    </span>
  )
}
