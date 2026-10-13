import { cn } from '@/lib/utils'

// Resumen de métricas con alcance explícito (#256): cada número dice a qué se
// refiere — «Tienda» (totales del negocio) o «En pantalla» (filas cargadas o
// filtradas) — para que no se mezclen total del tenant con lo que se está
// viendo. Mismo objeto para Clientes y cualquier listado.
//
// Tira compacta (docs/PANTALLAS.md): etiqueta 12px, cifra 20px semibold, pista
// de 12px, relleno 12px, ≤ 76px de alto. Si todas las métricas comparten el
// alcance, se muestra UNA vez al final de la tira en vez de bajo cada número.
export default function ResumenMetricas({ items = [], testId = 'resumen-metricas', className }) {
  if (!items.length) return null
  const alcances = new Set(items.map((item) => item.alcance || ''))
  const alcanceUnico = alcances.size === 1 && items[0].alcance ? items[0].alcance : ''
  return (
    <div
      data-testid={testId}
      className={cn('flex flex-wrap gap-px overflow-hidden rounded-xl border border-ink-600 bg-ink-600', className)}
    >
      {items.map(({ titulo, valor, alcance, nota, tono = '' }) => (
        <div key={titulo} className={'min-w-0 grow basis-[calc(50%-1px)] bg-ink-800 px-3 py-1.5 sm:basis-40'}>
          <p className="text-xs font-medium leading-4 text-mute">{titulo}</p>
          <p className={cn('v2-numero break-words text-xl font-semibold leading-7 tabular-nums', tono)}>{valor}</p>
          {((alcance && !alcanceUnico) || nota) && (
            <p className="text-xs leading-4 text-mute">
              {alcance && !alcanceUnico && <span className="font-semibold">{alcance}</span>}
              {alcance && !alcanceUnico && nota ? ' · ' : ''}
              {nota}
            </p>
          )}
        </div>
      ))}
      {alcanceUnico && (
        <p className="flex shrink-0 grow-0 basis-full items-center justify-end bg-ink-800 px-3 py-1 text-xs leading-4 text-mute sm:basis-auto sm:self-stretch">
          <span className="font-semibold">{alcanceUnico}</span>
        </p>
      )}
    </div>
  )
}
