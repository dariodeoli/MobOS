import { useMemo, useState } from 'react'
import { Badge, Button, Card, Modal, Select } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import SearchField from '@/components/shared/SearchField'
import { CELDA_DATO, CELDA_IDENTIDAD } from '@/components/shared/tabla'
import { PIE_ACCIONES } from '@/components/shared/formulario'
import { cn } from '@/lib/utils'
import { agruparRack, bateriaDe, conCosto, ESTACIONES, estadoEnRack, ETIQUETA_RACK, filtrarRack, gradoDe, ORDEN_RACK, TONO_RACK } from '@/lib/tallerRack'

const COLOR_GRADO = { A: 'green', B: 'orange', C: 'slate' }

function nombreUnidad(unit) {
  return unit?.product?.name || unit?.product?.nombre || 'Equipo'
}

function tileTonos(estado) {
  if (estado === 'listo') return 'border-ok/30 bg-ok/5'
  if (estado === 'verificado') return 'border-info/25 bg-info/5'
  return 'border-warn/25 bg-warn/5'
}

// Modo taller/rack (#240 §4): varios equipos en preparación agrupados por
// estación (por verificar → verificado → listo para vender), con filtros
// (búsqueda/ubicación), impresión en serie (selección o carril completo) y
// acciones por unidad. Reutiliza la verificación y las etiquetas del
// inventario; cuando INV aterrice la inspección (#240 §1-2), cada tile muestra
// el grado y la batería sin cambiar esta pantalla.
export default function TallerRack({
  unidades = [],
  ubicaciones = [],
  busy = false,
  onVerificar,
  onVerificarLote,
  onEtiqueta,
  onEtiquetasLote,
  onHoja,
}) {
  const [seleccionados, setSeleccionados] = useState([])
  const [imprimirAbierto, setImprimirAbierto] = useState(false)
  const [alcance, setAlcance] = useState('seleccion')
  const [estacion, setEstacion] = useState('todas')
  const [busqueda, setBusqueda] = useState('')
  const [ubicacionId, setUbicacionId] = useState('')

  const filtradas = useMemo(() => filtrarRack(unidades, { busqueda, ubicacionId }), [unidades, busqueda, ubicacionId])
  const grupos = useMemo(() => agruparRack(filtradas), [filtradas])
  const porId = useMemo(() => new Map(unidades.map((unit) => [unit.id, unit])), [unidades])
  const elegidas = seleccionados.map((id) => porId.get(id)).filter(Boolean)
  const visibles = estacion === 'todas' ? ORDEN_RACK : [estacion]
  const opcionesImpresion = [
    ...(elegidas.length ? [{ id: 'seleccion', label: 'Selección', lista: elegidas }] : []),
    ...(estacion !== 'todas' ? [{ id: 'estacion', label: `Estación «${ETIQUETA_RACK[estacion]}»`, lista: grupos[estacion] }] : []),
    { id: 'filtrados', label: 'Todo lo filtrado', lista: filtradas },
  ]
  const objetivo = (opcionesImpresion.find((opcion) => opcion.id === alcance) || opcionesImpresion[0]).lista
  const abrirImpresion = () => {
    setAlcance(elegidas.length ? 'seleccion' : estacion !== 'todas' ? 'estacion' : 'filtrados')
    setImprimirAbierto(true)
  }

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
  const conteo = (id) => (id === 'todas' ? filtradas.length : grupos[id].length)

  return (
    <Card className="p-4 md:p-5" data-testid="rack-taller">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">Modo taller</h2>
          <p className="mt-1 text-xs text-mute">
            Los equipos en preparación, de «por verificar» a «listo para vender». Elegí una estación, filtrá y actuá en serie.
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
            disabled={busy || filtradas.length === 0}
            onClick={abrirImpresion}
            data-testid="rack-imprimir-serie"
          >
            <Icon name="printer" className="h-4 w-4" /> Imprimir en serie…
          </Button>
          {elegidas.length > 0 && (
            <button
              type="button"
              className="text-xs font-semibold text-mute hover:underline"
              onClick={() => setSeleccionados([])}
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Estaciones del flujo (con conteos): Todas o una sola. */}
      <div className="mt-4 flex flex-wrap gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1" role="tablist" aria-label="Estaciones del taller">
        {ESTACIONES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={estacion === id}
            data-testid={`rack-estacion-${id}`}
            onClick={() => setEstacion(id)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
              estacion === id ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore',
            )}
          >
            {label}
            <span className="tabular-nums text-[10px] text-mute">{conteo(id)}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <SearchField
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
          placeholder="Buscar IMEI o modelo en el taller"
          ariaLabel="Buscar en el taller"
          className="min-w-0 flex-1"
        />
        <Select
          aria-label="Filtrar por ubicación"
          className="w-auto"
          value={ubicacionId}
          onChange={(event) => setUbicacionId(event.target.value)}
        >
          <option value="">Todas las ubicaciones</option>
          {ubicaciones.map((ubicacion) => (
            <option key={ubicacion.id} value={ubicacion.id}>{ubicacion.name}</option>
          ))}
        </Select>
      </div>

      <div className={cn('mt-4 grid gap-3', visibles.length > 1 ? 'lg:grid-cols-3' : '')}>
        {visibles.map((estado) => {
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
                  <span className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => alternarColumna(estado)}
                      className="text-[11px] font-semibold text-fono-light hover:underline"
                      data-testid={`rack-seleccionar-${estado}`}
                    >
                      {todos ? 'Quitar todos' : 'Seleccionar todos'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onEtiquetasLote?.(lista)}
                      className="text-[11px] font-semibold text-fono-light hover:underline disabled:opacity-50"
                      title={`Imprimir las etiquetas de los ${lista.length} equipos de esta estación`}
                      data-testid={`rack-imprimir-${estado}`}
                    >
                      Imprimir ({lista.length})
                    </button>
                  </span>
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
                          <p className={CELDA_IDENTIDAD} title={nombreUnidad(unit)}>{nombreUnidad(unit)}</p>
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
                    {busqueda || ubicacionId ? 'Nada coincide con el filtro.' : 'Sin equipos acá.'}
                  </p>
                )}
              </div>
            </section>
          )
        })}
      </div>

      {/* Impresión en serie (#240 §4): etiquetas del alcance elegido u hoja de
          estación imprimible para el depósito. */}
      <Modal open={imprimirAbierto} onClose={() => setImprimirAbierto(false)} title="Imprimir en serie" size="corto">
        <p className="text-sm text-mute">Elegí qué equipos entran en la impresión.</p>
        <div className="mt-3 space-y-1.5" role="radiogroup" aria-label="Alcance de la impresión">
          {opcionesImpresion.map(({ id, label, lista }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={alcance === id}
              data-testid={`rack-alcance-${id}`}
              onClick={() => setAlcance(id)}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition',
                alcance === id ? 'border-fono bg-fono/10 text-fono-light' : 'border-ink-600 hover:border-fono/40',
              )}
            >
              <span className="font-semibold">{label}</span>
              <span className="shrink-0 text-xs tabular-nums text-mute">{lista.length} equipos</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-mute" data-testid="rack-impresion-resumen">
          {objetivo.length} etiqueta(s): {objetivo.slice(0, 6).map((unit) => `${nombreUnidad(unit)} ${String(unit.serial || '').slice(-4)}`).join(' · ')}
          {objetivo.length > 6 ? ` · +${objetivo.length - 6}` : ''}
        </p>
        <div className={cn(PIE_ACCIONES, 'mt-4')}>
          <Button type="button" variant="outline" disabled={!objetivo.length || busy} onClick={() => { onHoja?.(objetivo, estacion === 'todas' ? 'Taller' : ETIQUETA_RACK[estacion]); setImprimirAbierto(false) }} data-testid="rack-hoja-estacion">
            Hoja de estación
          </Button>
          <Button type="button" disabled={!objetivo.length || busy} onClick={() => { onEtiquetasLote?.(objetivo); setSeleccionados([]); setImprimirAbierto(false) }} data-testid="rack-imprimir-serie-confirmar">
            <Icon name="printer" className="h-4 w-4" /> Etiquetas ({objetivo.length})
          </Button>
        </div>
      </Modal>
    </Card>
  )
}
