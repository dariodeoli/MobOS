import EsquemaEquipo from '@/components/shared/EsquemaEquipo'
import Icon from '@/components/shared/Icon'
import { ROTULO_DATO } from '@/components/shared/tabla'
import { cn } from '@/lib/utils'

// Inspección visual unificada (#315): el dibujo y la lista comparten una sola
// numeración y un solo estado. Los primeros 8 puntos se marcan desde el
// esquema o desde la lista; el resto (si la tienda configuró más) solo desde la
// lista. Se guarda en el mismo objeto que lee la hoja impresa.
export default function InspeccionEquipo({ tipo = 'iPhone', puntos = [], marcados = {}, onChange, disabled = false }) {
  const lista = Array.isArray(puntos) ? puntos : []
  const numeros = new Map(lista.slice(0, 8).map((etiqueta, indice) => [etiqueta, indice + 1]))
  const revisados = lista.filter((etiqueta) => Boolean(marcados[etiqueta])).length
  const marcar = (etiqueta) => onChange?.({ ...marcados, [etiqueta]: !marcados[etiqueta] })

  return (
    <div data-testid="inspeccion-equipo" className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <EsquemaEquipo tipo={tipo} puntos={lista} marcados={marcados} onToggle={marcar} disabled={disabled} mostrarContador={false} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={ROTULO_DATO}>Puntos de inspección</p>
          <span data-testid="inspeccion-contador" className="text-[11px] font-semibold tabular-nums text-mute">
            {revisados} de {lista.length} revisados
          </span>
        </div>
        <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
          {lista.map((etiqueta) => {
            const numero = numeros.get(etiqueta)
            const activo = Boolean(marcados[etiqueta])
            return (
              <li key={etiqueta}>
                <button
                  type="button"
                  aria-pressed={activo}
                  disabled={disabled}
                  onClick={() => marcar(etiqueta)}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs transition md:min-h-0',
                    activo ? 'border-ok/40 bg-ok/10 text-fore' : 'border-ink-600 text-mute hover:border-fono/40 hover:text-fore',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold tabular-nums',
                      activo ? 'bg-ok/20 text-ok' : numero ? 'bg-ink-700 text-mute' : 'border border-ink-600 text-mute',
                    )}
                  >
                    {numero || '·'}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{etiqueta}</span>
                  {activo && <Icon name="check" className="h-3.5 w-3.5 shrink-0 text-ok" />}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
