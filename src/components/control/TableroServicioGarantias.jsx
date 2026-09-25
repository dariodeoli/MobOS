import { useMemo, useState } from 'react'
import { Button, EmptyState, Skeleton } from '@/components/ui'
import SearchField from '@/components/shared/SearchField'
import SegmentedField from '@/components/shared/SegmentedField'
import { ESTADOS_SERVICIO, ESTADO_SERVICIO_LABEL, SIGUIENTE_SERVICIO } from '@/lib/estadosServicio'
import { ESTADO_GARANTIA, SIGUIENTE_GARANTIA } from '@/lib/estadosPedido'
import { partesDispositivo, varianteDispositivo } from '@/lib/dispositivos'
import { temaV2Activo } from '@/lib/temaV2'
import { cn } from '@/lib/utils'
import { CELDA_DATO, CELDA_ENCABEZADO, CELDA_IDENTIDAD_GRANDE, ROTULO_SECCION } from '@/components/shared/tabla'

// Tablero por etapas del taller y las garantías (#215/#241): una columna por
// estado —los 8 del taller y los 4 de una garantía—, con contador y tarjetas
// (cliente, equipo, IMEI). El avance de etapa vive en la propia tarjeta y usa
// el pipeline real de cada origen: no agrupa ni inventa etapas.
const TIPOS = [['servicio', 'Órdenes'], ['garantias', 'Garantías']]
const ETAPAS_GARANTIA = Object.entries(ESTADO_GARANTIA)

export default function TableroServicioGarantias({ filas, error, onReintentar, onAvanzar, procesandoId }) {
  const v2 = temaV2Activo()
  const [tipo, setTipo] = useState('servicio')
  const [busqueda, setBusqueda] = useState('')

  const esServicio = tipo === 'servicio'
  const etapas = esServicio ? ESTADOS_SERVICIO.map(([id, label]) => [id, label]) : ETAPAS_GARANTIA
  const siguienteDe = esServicio ? SIGUIENTE_SERVICIO : SIGUIENTE_GARANTIA
  const etiquetaDe = (etapa) => (esServicio ? ESTADO_SERVICIO_LABEL[etapa] : ESTADO_GARANTIA[etapa]) || etapa
  const nombreDe = esServicio ? 'órdenes' : 'garantías'

  const delTipo = useMemo(() => (filas || []).filter((fila) => (esServicio ? fila.tipo === 'SERVICIO' : fila.tipo === 'GARANTIA')), [filas, esServicio])
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return delTipo
      .filter((fila) => !q || [fila.cliente, fila.equipo, fila.serial, fila.codigo].some((valor) => String(valor || '').toLowerCase().includes(q)))
      // La que espera hace más tiempo va primero, como en el taller.
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
  }, [delTipo, busqueda])

  const porEtapa = useMemo(() => {
    const mapa = {}
    for (const fila of visibles) (mapa[fila.estadoCodigo] = mapa[fila.estadoCodigo] || []).push(fila)
    return mapa
  }, [visibles])

  return (
    <div className="space-y-3" data-testid="servicio-garantias-tablero">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedField value={tipo} onChange={setTipo} ariaLabel="Ver el tablero de órdenes o de garantías" options={TIPOS} />
        <div className="min-w-[12rem] flex-1">
          <SearchField ariaLabel="Buscar en el tablero" placeholder="Cliente, equipo o IMEI" value={busqueda} onChange={(event) => setBusqueda(event.target.value)} />
        </div>
      </div>

      <p className="text-sm text-mute">
        {esServicio
          ? 'Cada orden en su etapa del taller; avanzá desde la tarjeta sin salir del tablero.'
          : 'Cada garantía en su etapa; avanzá desde la tarjeta sin salir del tablero.'}
      </p>

      {filas === null && (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-11 w-full" />
          <div className="flex flex-col gap-3 lg:flex-row">
            {[0, 1, 2].map((indice) => <Skeleton key={indice} className="h-40 w-full lg:w-60" />)}
          </div>
        </div>
      )}

      {filas !== null && error && (
        <EmptyState compact icon="alert" title="No se pudieron cargar los registros" description={error} action={<Button onClick={onReintentar}>Reintentar</Button>} />
      )}

      {filas !== null && !error && !visibles.length && (
        delTipo.length ? (
          <EmptyState compact icon="search" title={`Ninguna ${esServicio ? 'orden' : 'garantía'} coincide con la búsqueda.`} />
        ) : (
          <EmptyState
            compact
            icon={esServicio ? 'wrench' : 'shield'}
            title={esServicio ? 'Todavía no hay órdenes de servicio.' : 'Todavía no hay garantías.'}
            description={esServicio ? 'Cargá la primera orden para seguir el taller de punta a punta.' : 'Cargá el primer caso para seguir su ciclo de vida.'}
          />
        )
      )}

      {filas !== null && !error && visibles.length > 0 && (
        // Mobile: una etapa debajo de la otra (sin scroll horizontal de página);
        // desde lg: columnas con desplazamiento contenido en el propio tablero.
        <div className="flex flex-col gap-3 lg:flex-row lg:overflow-x-auto lg:pb-2">
          {etapas.map(([id, label]) => {
            const tarjetas = porEtapa[id] || []
            return (
              <section
                key={id}
                data-testid="tablero-etapa"
                data-etapa={id}
                aria-label={`${label}: ${tarjetas.length} ${nombreDe}`}
                className={cn('flex flex-col gap-2 rounded-xl border border-ink-600 bg-ink-800/40 p-2', v2 && 'v2-tile', 'lg:w-60 lg:shrink-0')}
              >
                <header className="flex items-center justify-between gap-2 px-1 pt-1">
                  <h3 className={cn(ROTULO_SECCION, 'truncate')} title={label}>{label}</h3>
                  <span
                    data-testid="tablero-contador"
                    className={cn('grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-ink-700 px-1.5 text-xs font-semibold tabular-nums', v2 && 'v2-numero')}
                  >
                    {tarjetas.length}
                  </span>
                </header>
                {!tarjetas.length && <p className={cn(CELDA_DATO, 'px-1 pb-1')}>Sin {nombreDe}.</p>}
                {tarjetas.map((fila) => {
                  const siguiente = siguienteDe[fila.estadoCodigo]
                  const partes = partesDispositivo(fila.equipo)
                  const variante = varianteDispositivo(fila.equipo)
                  return (
                    <article
                      key={fila.key}
                      data-testid="tablero-tarjeta"
                      data-cliente={fila.cliente}
                      data-codigo={fila.codigo || ''}
                      className={cn('rounded-lg border border-ink-600 bg-ink-800 p-3', v2 && 'v2-tile')}
                    >
                      <p className={CELDA_ENCABEZADO} title={fila.codigo || undefined}>
                        {fila.codigo || (esServicio ? 'Orden de servicio' : 'Garantía')}
                      </p>
                      <p className={cn(CELDA_IDENTIDAD_GRANDE, 'mt-1')} title={fila.cliente}>{fila.cliente}</p>
                      <p className={CELDA_DATO} title={fila.equipo || undefined}><span className="font-medium text-fore">{partes.modelo || 'Sin equipo'}</span>{variante ? ` · ${variante}` : ''}</p>
                      <p className={CELDA_DATO} title={fila.serial || undefined}>{fila.serial ? `IMEI ${fila.serial}` : 'Sin IMEI'}</p>
                      {fila.enServicio && <p className="mt-1 truncate text-[11px] text-mute" title={`En taller: ${fila.enServicio}`}>En taller: {fila.enServicio}</p>}
                      {siguiente && (
                        <Button
                          variant="outline"
                          className="mt-2 h-9 w-full px-2 text-xs"
                          data-testid="tablero-avanzar"
                          disabled={procesandoId === fila.key}
                          title={`Pasar a ${etiquetaDe(siguiente)}`}
                          aria-label={`Pasar a ${etiquetaDe(siguiente)}: ${fila.equipo || fila.cliente}`}
                          onClick={() => onAvanzar(fila)}
                        >
                          <span className="truncate">→ {etiquetaDe(siguiente)}</span>
                        </Button>
                      )}
                    </article>
                  )
                })}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
