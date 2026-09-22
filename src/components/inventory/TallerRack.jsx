import { useMemo, useState } from 'react'
import { Badge, Button, Card } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { CELDA_DATO } from '@/components/shared/tabla'
import { cn } from '@/lib/utils'
import { agruparRack, bateriaDe, conCosto, estadoEnRack, ETIQUETA_RACK, gradoDe, ORDEN_RACK, TONO_RACK } from '@/lib/tallerRack'

const COLOR_GRADO = { A: 'green', B: 'orange', C: 'slate' }

function nombreUnidad(unit) {
  return unit?.product?.name || unit?.product?.nombre || 'Equipo'
}

function tileTonos(estado) {
  if (estado === 'listo') return 'border-ok/30 bg-ok/5'
  if (estado === 'verificado') return 'border-sky-400/25 bg-sky-400/5'
  return 'border-warn/25 bg-warn/5'
}

// Modo taller/rack (#240 §4): varios equipos en preparación agrupados por
// estado (por verificar → verificado → listo para vender) con acciones en serie
// (verificar / imprimir etiquetas). Reutiliza la verificación y las etiquetas
// del inventario; cuando INV aterrice la inspección (#240 §1-2), cada tile
// muestra el grado y la batería sin cambiar esta pantalla.
export default function TallerRack({
  unidades = [],
  busy = false,
  onVerificar,
  onVerificarLote,
  onEtiqueta,
  onEtiquetasLote,
}) {
  const [seleccionados, setSeleccionados] = useState([])
  const grupos = useMemo(() => agruparRack(unidades), [unidades])
  const porId = useMemo(() => new Map(unidades.map((unit) => [unit.id, unit])), [unidades])
  const elegidas = seleccionados.map((id) => porId.get(id)).filter(Boolean)

  const alternar = (id) => setSeleccionados((actuales) => (
    actuales.includes(id) ? actuales.filter((x) => x !== id) : [...actuales, id]
  ))
  const alternarColumna = (estado) => {
    const ids = grupos[estado].map((unit) => unit.id)
    setSeleccionados((actuales) => {
      const todos = ids.length > 0 && ids.every((id) => actuales.includes(id))
      return todos ? actuales.filter((id) => !ids.includes(id)) : [...new Set([...actuales, ...ids])]
    })
  }

  return (
    <Card className="p-4 md:p-5" data-testid="rack-taller">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">Modo taller</h2>
          <p className="mt-1 text-xs text-mute">
            Los equipos en preparación, de «por verificar» a «listo para vender». Seleccioná varios para actuar en serie.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-mute" data-testid="rack-seleccionados">{elegidas.length} seleccionados</span>
          <Button
            type="button"
            variant="outline"
            disabled={busy || elegidas.length === 0}
            onClick={() => { onVerificarLote?.(elegidas); setSeleccionados([]) }}
            data-testid="rack-verificar-lote"
          >
            <Icon name="check" className="h-4 w-4" /> Verificar
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || elegidas.length === 0}
            onClick={() => { onEtiquetasLote?.(elegidas); setSeleccionados([]) }}
            data-testid="rack-imprimir-lote"
          >
            <Icon name="printer" className="h-4 w-4" /> Imprimir etiquetas
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {ORDEN_RACK.map((estado) => {
          const lista = grupos[estado]
          const todos = lista.length > 0 && lista.every((unit) => seleccionados.includes(unit.id))
          return (
            <section
              key={estado}
              data-testid={`rack-columna-${estado}`}
              className="rounded-2xl border border-ink-600 bg-ink-800/40 p-3"
            >
              <header className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Badge color={TONO_RACK[estado]}>{ETIQUETA_RACK[estado]}</Badge>
                  <span className="text-xs tabular-nums text-mute">{lista.length}</span>
                </span>
                {lista.length > 0 && (
                  <button
                    type="button"
                    onClick={() => alternarColumna(estado)}
                    className="text-[11px] font-semibold text-fono-light hover:underline"
                    data-testid={`rack-seleccionar-${estado}`}
                  >
                    {todos ? 'Quitar todos' : 'Seleccionar todos'}
                  </button>
                )}
              </header>
              <div className="mt-3 space-y-2">
                {lista.map((unit) => {
                  const grado = gradoDe(unit)
                  const bateria = bateriaDe(unit)
                  const estadoUnidad = estadoEnRack(unit)
                  return (
                    <article
                      key={unit.id}
                      data-testid="rack-equipo"
                      data-serial={unit.serial}
                      className={cn('rounded-xl border p-2.5 transition', tileTonos(estadoUnidad), seleccionados.includes(unit.id) && 'ring-1 ring-fono/50')}
                    >
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={seleccionados.includes(unit.id)}
                          onChange={() => alternar(unit.id)}
                          aria-label={`Seleccionar ${unit.serial}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold" title={nombreUnidad(unit)}>{nombreUnidad(unit)}</p>
                          <p className="mt-0.5 truncate font-mono text-[11px] text-fono-light" title={unit.serial}>{unit.serial}</p>
                          <p className="mt-1 flex flex-wrap items-center gap-1.5">
                            {grado && <Badge color={COLOR_GRADO[grado]}>Grado {grado}</Badge>}
                            {bateria !== null && <Badge color={bateria >= 90 ? 'green' : bateria >= 80 ? 'orange' : 'slate'}>{bateria}% batería</Badge>}
                            {!conCosto(unit) && <Badge color="orange">Sin costo</Badge>}
                            {(unit.location?.name || unit.locationName) && <span className={CELDA_DATO}>{unit.location?.name || unit.locationName}</span>}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {estadoUnidad === 'por-verificar' && (
                            <Button type="button" variant="outline" className="h-7 px-2 text-[11px]" disabled={busy} onClick={() => onVerificar?.(unit)}>
                              Verificar
                            </Button>
                          )}
                          <Button type="button" variant="ghost" className="h-7 px-2 text-[11px]" disabled={busy} onClick={() => onEtiqueta?.(unit)} title="Imprimir etiqueta">
                            Etiqueta
                          </Button>
                        </div>
                      </div>
                    </article>
                  )
                })}
                {!lista.length && (
                  <p className="rounded-xl border border-dashed border-ink-600 p-3 text-center text-[11px] text-mute">
                    Sin equipos acá.
                  </p>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </Card>
  )
}
