import { cn } from '@/lib/utils'

// Resumen de métricas con alcance explícito (#256): cada tile dice a qué se
// refiere su número — «Tienda» (totales del negocio) o «En pantalla» (filas
// cargadas o filtradas) — para que no se mezclen total del tenant con lo que
// se está viendo. Mismo objeto para Clientes y cualquier listado.
const COLS = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-2 sm:grid-cols-4' }

export default function ResumenMetricas({ items = [], columnas = 3, testId = 'resumen-metricas', className }) {
  if (!items.length) return null
  return (
    <div
      data-testid={testId}
      className={cn('grid divide-ink-600 rounded-xl border border-ink-600 bg-ink-800/60 text-center sm:divide-x', COLS[columnas] || COLS[3], className)}
    >
      {items.map(({ titulo, valor, alcance, nota, tono = '' }) => (
        <div key={titulo} className="p-3">
          <p className="text-[11px] uppercase tracking-wider text-mute">{titulo}</p>
          <p className={cn('v2-numero mt-1 text-lg font-semibold tabular-nums sm:text-2xl', tono)}>{valor}</p>
          <p className="mt-0.5 text-[11px] text-mute">
            {alcance && <span className="font-semibold uppercase tracking-wide">{alcance}</span>}
            {alcance && nota ? ' · ' : ''}
            {nota}
          </p>
        </div>
      ))}
    </div>
  )
}
