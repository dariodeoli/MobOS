import { cn } from '@/lib/utils'

// Resumen de métricas con alcance explícito (#256): cada número dice a qué se
// refiere — «Tienda» (totales del negocio) o «En pantalla» (filas cargadas o
// filtradas) — para que no se mezclen total del tenant con lo que se está
// viendo. Mismo objeto para Clientes y cualquier listado.
//
// Tira de UNA línea (#388): «etiqueta + cifra» por métrica, ≤ 64px de alto
// (etiqueta 12px, cifra 16px semibold). Sin subtextos redundantes: si todas las
// métricas comparten el alcance se muestra UNA vez al final de la tira; si se
// mezclan, cada métrica lo lleva como sufijo. `nota` solo se pasa cuando aporta
// un dato distinto (p. ej. «50 en pantalla» junto al total de la tienda). En
// celular la tira se desplaza horizontalmente en vez de apilar filas.
export default function ResumenMetricas({ items = [], testId = 'resumen-metricas', className }) {
  if (!items.length) return null
  const alcances = new Set(items.map((item) => item.alcance || ''))
  const alcanceUnico = alcances.size === 1 && items[0].alcance ? items[0].alcance : ''
  return (
    <div
      data-testid={testId}
      role="group"
      aria-label="Resumen"
      tabIndex={0}
      className={cn('flex min-w-0 items-stretch overflow-x-auto rounded-xl border border-ink-600 bg-ink-800 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
    >
      {items.map(({ titulo, valor, alcance, nota, tono = '' }) => (
        <div key={titulo} className="flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap border-r border-ink-600 px-3 py-1.5 last:border-r-0 sm:min-w-0 sm:flex-1">
          <span className="text-xs font-medium leading-4 text-mute">{titulo}</span>
          <span className={cn('v2-numero text-base font-semibold leading-6 tabular-nums', tono)}>{valor}</span>
          {nota && <span className="text-xs leading-4 text-mute">{nota}</span>}
          {alcance && !alcanceUnico && <span className="text-xs font-semibold leading-4 text-mute">{alcance}</span>}
        </div>
      ))}
      {alcanceUnico && (
        <p className="flex shrink-0 items-center justify-end whitespace-nowrap px-3 text-xs font-semibold leading-4 text-mute">
          {alcanceUnico}
        </p>
      )}
    </div>
  )
}
