import { useCallback, useEffect, useMemo, useState } from 'react'
import { Aviso, Badge, BarraProgreso, Button, Card, EmptyState, Select, Skeleton } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { printingApi } from '@/lib/api/printing'
import { ROTULO_SECCION } from '@/components/shared/tabla'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'
import { cn } from '@/lib/utils'

// Panel de gráficos de impresión: SVG propio (sin librerías) para trabajos por
// hora y latencia promedio por impresora, más contadores y tasa de éxito. Los
// números salen de GET /api/print/metrics y no se recalculan en la UI.
const RANGOS = { '24h': { horas: 24, etiqueta: 'Últimas 24 h' }, '7d': { horas: 24 * 7, etiqueta: 'Últimos 7 días' }, '30d': { horas: 24 * 30, etiqueta: 'Últimos 30 días' } }
const MAX_BARRAS = 48
const REFRESCO_MS = 30_000

const ms = (valor) => (typeof valor === 'number' && Number.isFinite(valor) ? `${Math.round(valor)} ms` : '—')
const recortar = (texto, maximo) => (String(texto || '').length > maximo ? `${String(texto).slice(0, maximo - 1)}…` : String(texto || ''))

const horaTexto = (iso, rango) => {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return ''
  return rango === '24h'
    ? fecha.toLocaleTimeString('es-PY', { hour: '2-digit', hour12: false })
    : fecha.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit' })
}

// Reagrupa la serie horaria cuando el rango trae más buckets de los que se
// pueden leer en pantalla (7/30 días): suma trabajos y promedia duraciones.
function reducirSerie(serie, rango) {
  const datos = (serie || []).map((bucket) => ({ hora: bucket.hora, etiqueta: horaTexto(bucket.hora, rango), trabajos: bucket.trabajos, promedioDurationMs: bucket.promedioDurationMs }))
  if (datos.length <= MAX_BARRAS) return datos
  const tamano = Math.ceil(datos.length / MAX_BARRAS)
  const grupos = []
  for (let indice = 0; indice < datos.length; indice += tamano) {
    const porcion = datos.slice(indice, indice + tamano)
    const duraciones = porcion.map((bucket) => bucket.promedioDurationMs).filter((valor) => typeof valor === 'number')
    grupos.push({
      hora: porcion[0].hora,
      etiqueta: porcion[0].etiqueta,
      trabajos: porcion.reduce((suma, bucket) => suma + bucket.trabajos, 0),
      promedioDurationMs: duraciones.length ? Math.round(duraciones.reduce((suma, valor) => suma + valor, 0) / duraciones.length) : null,
    })
  }
  return grupos
}

// Barras verticales de trabajos por hora.
function BarrasPorHora({ datos, etiqueta }) {
  const maximo = Math.max(1, ...datos.map((bucket) => bucket.trabajos))
  const ancho = 640
  const alto = 132
  const margen = 18
  const paso = (ancho - margen * 2) / Math.max(1, datos.length)
  const cada = Math.max(1, Math.ceil(datos.length / 8))
  return (
    <svg viewBox={`0 0 ${ancho} ${alto + 16}`} className="w-full" role="img" aria-label={etiqueta}>
      {[0.5, 1].map((fraccion) => <line key={fraccion} x1={margen} x2={ancho - margen} y1={alto - fraccion * alto} y2={alto - fraccion * alto} className="stroke-ink-600" strokeWidth="1" />)}
      {datos.map((bucket, indice) => {
        const altura = bucket.trabajos > 0 ? Math.max(2, (bucket.trabajos / maximo) * (alto - 8)) : 0
        return (
          <rect
            key={`${bucket.hora}-${indice}`}
            x={margen + indice * paso + paso * 0.15}
            y={alto - altura}
            width={Math.max(1, paso * 0.7)}
            height={altura}
            rx="1.5"
            className="fill-fono"
          >
            <title>{`${bucket.etiqueta}: ${bucket.trabajos} trabajo(s)`}</title>
          </rect>
        )
      })}
      {datos.map((bucket, indice) => ((indice % cada === 0 || indice === datos.length - 1) ? (
        <text key={`eje-${bucket.hora}-${indice}`} x={margen + indice * paso + paso / 2} y={alto + 13} textAnchor="middle" className="fill-mute text-[10px]">{bucket.etiqueta}</text>
      ) : null))}
    </svg>
  )
}

// Barras horizontales de latencia promedio por impresora.
function BarrasPorImpresora({ filas }) {
  const maximo = Math.max(1, ...filas.map((fila) => fila.valor || 0))
  const altoFila = 30
  const alto = filas.length * altoFila + 8
  return (
    <svg viewBox={`0 0 660 ${alto}`} className="w-full" role="img" aria-label="Latencia promedio por impresora">
      {filas.map((fila, indice) => {
        const y = indice * altoFila + 6
        const anchoBarra = ((fila.valor || 0) / maximo) * 350
        return (
          <g key={`${fila.nombre}-${indice}`}>
            <text x="0" y={y + 12} className="fill-fore text-[11px]">{recortar(fila.nombre, 24)}</text>
            <rect x="170" y={y + 1} width="350" height="13" rx="3" className="fill-ink-600" />
            {fila.valor !== null && <rect x="170" y={y + 1} width={Math.max(2, anchoBarra)} height="13" rx="3" className="fill-fono">
              <title>{`${fila.nombre}: ${ms(fila.valor)}`}</title>
            </rect>}
            <text x="530" y={y + 12} className="fill-mute text-[11px]">{fila.muestras ? ms(fila.valor) : 'sin datos'}</text>
          </g>
        )
      })}
    </svg>
  )
}

export default function ImpresionGraficos({ impresoras = [] }) {
  const [rango, setRango] = useState('24h')
  const [printerId, setPrinterId] = useState('')
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const consultar = useCallback(async () => {
    setError('')
    try {
      const hasta = new Date()
      const desde = new Date(hasta.getTime() - RANGOS[rango].horas * 60 * 60 * 1000)
      setDatos(await printingApi.metricas({ desde: desde.toISOString(), hasta: hasta.toISOString(), ...(printerId ? { printerId } : {}) }))
    } catch (cause) {
      setError(cause?.message || 'No se pudieron cargar las métricas de impresión.')
    } finally {
      setCargando(false)
    }
  }, [rango, printerId])

  useEffect(() => {
    setCargando(true)
    consultar()
    const intervalo = setInterval(consultar, REFRESCO_MS)
    return () => clearInterval(intervalo)
  }, [consultar])

  const serie = useMemo(() => reducirSerie(datos?.serie, rango), [datos, rango])
  const latencias = useMemo(() => (datos?.latencias?.porImpresora || []).map((grupo) => ({
    nombre: grupo.printerName || 'Sin impresora',
    valor: grupo.promedioDurationMs,
    muestras: grupo.muestras,
  })), [datos])
  const tasa = datos?.totales?.tasaExito ?? null

  return (
    <Card className="space-y-4" data-testid="graficos-impresion">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Icon name="chart" className="h-4 w-4 text-mute" />Panel de impresiones</h3>
          <p className="mt-1 text-sm text-mute">Trabajos por hora, latencia promedio por impresora y tasa de éxito del rango{datos?.hasta ? ` · actualizado ${new Date(datos.hasta).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}` : ''}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Rango de métricas" className="w-36" value={rango} onChange={(event) => setRango(event.target.value)}>
            {Object.entries(RANGOS).map(([valor, config]) => <option key={valor} value={valor}>{config.etiqueta}</option>)}
          </Select>
          <Select aria-label="Impresora de las métricas" className="w-44" value={printerId} onChange={(event) => setPrinterId(event.target.value)}>
            <option value="">Todas las impresoras</option>
            {impresoras.map((impresora) => <option key={impresora.id} value={impresora.id}>{impresora.nombre}</option>)}
          </Select>
          <Button type="button" variant="outline" onClick={consultar} disabled={cargando}><Icon name="refresh" className="h-3.5 w-3.5" />Actualizar</Button>
        </div>
      </div>

      {error && <Aviso tono="error" className="p-3 rounded-xl">{error}</Aviso>}

      {cargando && !datos ? (
        <div className="space-y-2"><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>
      ) : (
        <>
          <div className={cn('lg:grid-cols-5', GRILLA_DOS_COLUMNAS)}>
            <div className="rounded-xl border border-ink-600 p-3">
              <p className="text-xs uppercase tracking-wider text-mute">Trabajos</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{datos?.totales?.trabajos ?? 0}</p>
              <p className="mt-1 text-xs text-mute">{datos?.totales?.enCola ?? 0} en cola · {datos?.totales?.inciertos ?? 0} inciertos</p>
            </div>
            <div className="rounded-xl border border-ink-600 p-3">
              <p className="text-xs uppercase tracking-wider text-mute">Promedio</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{ms(datos?.latencias?.global?.promedioDurationMs)}</p>
              <p className="mt-1 text-xs text-mute">cola {ms(datos?.latencias?.global?.promedioQueueMs)}</p>
            </div>
            <div className="rounded-xl border border-ink-600 p-3">
              <p className="text-xs uppercase tracking-wider text-mute">p95</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{ms(datos?.latencias?.global?.p95DurationMs)}</p>
              <p className="mt-1 text-xs text-mute">{datos?.latencias?.global?.muestras ?? 0} trabajo(s) medidos</p>
            </div>
            <div className="rounded-xl border border-ink-600 p-3">
              <p className="text-xs uppercase tracking-wider text-mute">Fallos</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-bad">{datos?.totales?.fallos ?? 0}</p>
              <p className="mt-1 text-xs text-mute">{datos?.totales?.exitosos ?? 0} exitosos</p>
            </div>
            <div className="rounded-xl border border-ink-600 p-3">
              <p className="text-xs uppercase tracking-wider text-mute">Tasa de éxito</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{tasa === null ? '—' : `${tasa}%`}</p>
              <BarraProgreso className="mt-2" valor={tasa ?? 0} tono={tasa === null ? 'mute' : tasa >= 90 ? 'ok' : tasa >= 70 ? 'warn' : 'bad'} alto="lg" pista="bg-ink-600" etiqueta={`Tasa de éxito: ${tasa ?? 0}%`} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <h4 className={ROTULO_SECCION}>Trabajos por hora</h4>
                <Badge color="blue">{RANGOS[rango].etiqueta}</Badge>
              </div>
              {serie.length && serie.some((bucket) => bucket.trabajos > 0) ? (
                <BarrasPorHora datos={serie} etiqueta={`Trabajos por hora · ${RANGOS[rango].etiqueta}`} />
              ) : (
                <EmptyState compact icon="clock" title="Sin trabajos en el rango." description="Probá otro rango o enviá una prueba." />
              )}
            </section>
            <section className="space-y-1">
              <h4 className={ROTULO_SECCION}>Latencia promedio por impresora</h4>
              {latencias.length ? <BarrasPorImpresora filas={latencias} /> : (
                <EmptyState compact icon="pulse" title="Sin latencias medidas." description="Los trabajos en cola no tienen tiempos todavía." />
              )}
            </section>
          </div>
        </>
      )}
    </Card>
  )
}
