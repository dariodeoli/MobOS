import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, Modal, Select } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import SearchField from '@/components/shared/SearchField'
import PasosEquipo from '@/components/shared/PasosEquipo'
import { PIE_ACCIONES } from '@/components/shared/formulario'
import { buildUnitLabelsHtml } from '@/components/shared/OrderReceipt'
import CompartirImagen from '@/components/shared/CompartirImagen'
import { BarraLote, ConteoChecklist, ContadorLote, TileEquipo, VistaPreviaPapel } from 'owncoding-ui'
import { cn } from '@/lib/utils'
import { configImpresora } from '@/lib/printing/agent'
import { agruparRack, bateriaDe, checklistDe, conCosto, ESTACIONES, estadoEnRack, ETIQUETA_RACK, filtrarRack, gradoDe, locksDe, ORDEN_RACK, TONO_RACK } from '@/lib/tallerRack'

function nombreUnidad(unit) {
  return unit?.product?.name || unit?.product?.nombre || 'Equipo'
}

// Vista previa del rollo: no se generan los QR de un lote entero, alcanza con
// las primeras etiquetas (lo impreso sale completo).
const ETIQUETAS_EN_VISTA = 3
const FORMATO_PAPEL = { 80: 'thermal-80', 58: 'thermal-58', 55: 'thermal-55' }

// Modo taller/rack v2 (#240 §4, #241 paso 4): carriles por estación
// (por verificar → verificado → listo para vender) con los objetos compartidos
// de owncoding-ui — `TileEquipo`, `BarraLote`, `ContadorLote`,
// `ConteoChecklist` y `VistaPreviaPapel` — más las acciones en serie
// (verificar, etiquetas del alcance elegido y hoja de estación). La impresión
// sigue saliendo por el camino de siempre (agente/puente, etiquetas 80/58 mm
// con QR); la vista previa muestra el rollo real configurado.
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
  const [vistaHtml, setVistaHtml] = useState('')

  const ancho = configImpresora().ancho
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
  const pedidas = Math.min(ETIQUETAS_EN_VISTA, objetivo.length)
  // Clave estable del alcance: evita regenerar la vista en cada render.
  const claveObjetivo = objetivo.map((unit) => unit.id).join(',')

  // Vista previa de las etiquetas con el ancho real del rollo (#241): el mismo
  // HTML que baja al diálogo de respaldo, para que «lo que se ve es lo que sale».
  useEffect(() => {
    if (!imprimirAbierto || !claveObjetivo) {
      setVistaHtml('')
      return undefined
    }
    let vivo = true
    buildUnitLabelsHtml(objetivo.slice(0, ETIQUETAS_EN_VISTA), { ancho })
      .then((html) => { if (vivo) setVistaHtml(html) })
      .catch(() => { if (vivo) setVistaHtml('') })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imprimirAbierto, claveObjetivo, ancho])

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
          {filtradas.length > 0 && (
            <ContadorLote
              recibidos={grupos.listo.length}
              total={filtradas.length}
              variante="chip"
              sufijo="listos"
              mostrarFaltan
              className="tabular-nums"
            />
          )}
          <Button
            type="button"
            variant="outline"
            disabled={busy || filtradas.length === 0}
            onClick={abrirImpresion}
            data-testid="rack-imprimir-serie"
          >
            <Icon name="printer" className="h-4 w-4" /> Imprimir en serie…
          </Button>
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
              'flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition md:min-h-0',
              estacion === id ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore',
            )}
          >
            {label}
            {/* El contador hereda el color de la pestaña (AA): con `text-mute`
                sobre el tinte del activo quedaba en 3.96:1 en oscuro. */}
            <span className="tabular-nums text-[10px]">{id === 'todas' ? filtradas.length : grupos[id].length}</span>
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

      {/* Acciones en serie (BarraLote): aparecen con la selección y dicen sobre
          cuántos equipos se va a actuar. */}
      <BarraLote
        cantidad={elegidas.length}
        etiqueta={<span className="text-xs text-mute" data-testid="rack-seleccionados">{elegidas.length} seleccionados</span>}
        onLimpiar={() => setSeleccionados([])}
        className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-fono/30 bg-fono/5 px-3 py-2 text-sm"
      >
        <Button
          type="button"
          variant="outline"
          className="min-h-11 md:min-h-0"
          disabled={busy}
          onClick={() => { onVerificarLote?.(elegidas); setSeleccionados([]) }}
          data-testid="rack-verificar-lote"
        >
          <Icon name="check" className="h-4 w-4" /> Verificar
        </Button>
        <Button type="button" variant="outline" className="min-h-11 md:min-h-0" disabled={busy} onClick={abrirImpresion} data-testid="rack-imprimir-seleccion">
          <Icon name="printer" className="h-4 w-4" /> Etiquetas…
        </Button>
        <Button type="button" variant="outline" className="min-h-11 md:min-h-0" disabled={busy} onClick={() => onHoja?.(elegidas, 'Selección')} data-testid="rack-hoja-seleccion">
          <Icon name="report" className="h-4 w-4" /> Hoja de estación
        </Button>
      </BarraLote>

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
                  <ContadorLote recibidos={lista.length} total={filtradas.length} variante="chip" className="tabular-nums" />
                </span>
                {lista.length > 0 && (
                  <span className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => alternarColumna(estado)}
                      className="toque-44 text-[11px] font-semibold text-fono-light hover:underline"
                      data-testid={`rack-seleccionar-${estado}`}
                    >
                      {todos ? 'Quitar todos' : 'Seleccionar todos'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onEtiquetasLote?.(lista)}
                      className="toque-44 text-[11px] font-semibold text-fono-light hover:underline disabled:opacity-50"
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
                  const checklist = checklistDe(unit)
                  const estadoUnidad = estadoEnRack(unit)
                  const seleccionado = seleccionados.includes(unit.id)
                  return (
                    <div
                      key={unit.id}
                      data-testid="rack-equipo"
                      data-serial={unit.serial}
                      className={cn('flex items-start gap-2 transition', seleccionado && 'rounded-2xl ring-2 ring-fono/50')}
                    >
                      <input
                        type="checkbox"
                        className="mt-4 ml-1 shrink-0"
                        checked={seleccionado}
                        onChange={() => alternar(unit.id)}
                        aria-label={`Seleccionar ${unit.serial}`}
                      />
                      <div className="min-w-0 flex-1">
                        <TileEquipo
                          modelo={nombreUnidad(unit)}
                          imei={unit.serial}
                          detalle={unit.location?.name || unit.locationName || undefined}
                          // El chip solo avisa cuando hay algo que mirar (fallas del checklist).
                          estado={checklist?.fallan > 0 ? 'falla' : undefined}
                          grado={grado}
                          bateria={bateria}
                          locks={locksDe(unit)}
                          acciones={(
                            <>
                              <PasosEquipo estado={estadoUnidad} testId="rack-pasos" className="mr-auto" />
                              {checklist && (
                                <ConteoChecklist pasan={checklist.pasan} total={checklist.total} fallas={checklist.fallan} />
                              )}
                              {!conCosto(unit) && <Badge color="orange">Sin costo</Badge>}
                              {estadoUnidad === 'por-verificar' && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="toque-44 h-8 px-2 text-xs"
                                  disabled={busy}
                                  onClick={() => onVerificar?.(unit)}
                                >
                                  Verificar
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                className="toque-44 h-8 px-2 text-xs"
                                disabled={busy}
                                onClick={() => onEtiqueta?.(unit)}
                                title="Imprimir etiqueta"
                              >
                                Etiqueta
                              </Button>
                            </>
                          )}
                        />
                      </div>
                    </div>
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

      {/* Impresión en serie (#240 §4): etiquetas del alcance elegido con la vista
          previa del rollo real, u hoja de estación imprimible para el depósito. */}
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
        {vistaHtml && (
          <div className="mt-4" data-testid="rack-vista-previa">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-mute">Vista previa · rollo de {ancho} mm</span>
              <ContadorLote recibidos={pedidas} total={objetivo.length} variante="chip" sufijo="en la vista" />
            </div>
            <VistaPreviaPapel
              formato={FORMATO_PAPEL[ancho] || 'thermal-80'}
              contenido={vistaHtml}
              titulo="Vista previa de las etiquetas"
              alto="h-[34vh]"
              className="mt-2"
            />
          </div>
        )}
        <div className={cn(PIE_ACCIONES, 'mt-4')}>
          <CompartirImagen
            construirHtml={() => buildUnitLabelsHtml(objetivo, { ancho })}
            nombre={`etiquetas-taller-${objetivo.length}`}
            titulo="Etiquetas del taller"
            texto={`${objetivo.length} etiqueta(s) · rollo de ${ancho} mm`}
            formato={FORMATO_PAPEL[ancho] || 'thermal-80'}
            disabled={!objetivo.length || busy}
          />
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
