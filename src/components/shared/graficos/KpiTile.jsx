import { BarraProgreso } from '@/components/ui'
import { cn } from '@/lib/utils'
import { temaV2Activo } from '@/lib/temaV2'
import ChipDelta from './ChipDelta.jsx'
import Sparkline from './Sparkline.jsx'

const COLOR = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', neutro: 'text-fore' }
const SERIE = { ok: 'var(--g-1)', warn: 'var(--g-3)', bad: 'var(--g-5)', neutro: 'var(--g-2)' }

// Indicador de la franja de resumen: etiqueta, importe completo, variación con
// su base («vs período anterior»), tendencia y una línea de contexto. Usa las
// clases `.inicio-kpi*` de la franja existente para no cambiar su geometría.
export default function KpiTile({ testId, etiqueta, valor, delta, comparado, invertido, sub, tono = 'neutro', progreso, serie, etiquetaSerie }) {
  const v2 = temaV2Activo()
  return (
    <div className="inicio-kpi" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium leading-4 text-mute">{etiqueta}</span>
        <ChipDelta valor={delta} comparado={comparado} invertido={invertido} />
      </div>
      <div className={cn('inicio-kpi-value font-semibold tracking-tight tabular-nums', v2 && 'v2-numero', COLOR[tono] || 'text-fore')}>{valor}</div>
      {typeof progreso === 'number' && (
        <BarraProgreso className="mt-1" valor={progreso} tono="ok" etiqueta={`Cobrado: ${Math.round(progreso)}%`} />
      )}
      {Array.isArray(serie) && serie.length > 1 && (
        <div className="mt-1 flex">
          <Sparkline valores={serie} etiqueta={etiquetaSerie} alto={28} color={SERIE[tono] || SERIE.neutro} />
        </div>
      )}
      {sub && <p className="mt-0.5 text-xs leading-4 text-mute">{sub}</p>}
    </div>
  )
}
