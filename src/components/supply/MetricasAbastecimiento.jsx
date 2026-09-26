import { useCallback, useEffect, useMemo, useState } from 'react'
import { resources } from '@/lib/api'
import { isDemoRuntime } from '@/lib/demoMode'
import { Badge, Button, Card, CeldaMoneda, DataTable, ErrorState, FilaDato, Select, Skeleton, Stat, Subtabs } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'
import { gs } from '@/utils/calculos'
import { resumenDeCompras, resumenDeRutaCde, tonoPuntualidad } from '@/lib/metricasAbastecimiento'

// Abastecimiento · F6 (#250): panel de métricas para decidir a quién y cómo
// comprar — rendimiento por proveedor con costo real (moneda ya convertida),
// tiempos de tránsito (CDE → Asunción incluida) y atrasos del momento.
// Solo lectura: las compras y recepciones viven en sus paneles.

const VENTANAS = [
  [30, 'Últimos 30 días'],
  [90, 'Últimos 90 días'],
  [180, 'Últimos 180 días'],
]

const PRIORIDAD = { URGENTE: 'Urgente', ALTA: 'Alta', NORMAL: 'Normal', BAJA: 'Baja' }
const TONO_PRIORIDAD = { URGENTE: 'red', ALTA: 'orange', NORMAL: 'blue', BAJA: 'slate' }
const ESTADO_ENVIO = { PREPARANDO: 'Preparando', DESPACHADO: 'Despachado', EN_TRANSITO: 'En tránsito', CON_INCIDENCIA: 'Con incidencia' }

const fechaCorta = (valor) => {
  if (!valor) return '—'
  const fecha = new Date(valor)
  return Number.isNaN(fecha.getTime()) ? '—' : fecha.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit' })
}

const diasTexto = (valor, sufijo = ' d') => (valor == null ? '—' : `${Number(valor).toLocaleString('es-PY', { maximumFractionDigits: 1 })}${sufijo}`)
const porcentajeTexto = (valor) => (valor == null ? '—' : `${valor}%`)
const fechaHora = (valor) => {
  if (!valor) return '—'
  const fecha = new Date(valor)
  return Number.isNaN(fecha.getTime()) ? '—' : fecha.toLocaleString('es-PY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function MetricasAbastecimiento() {
  const esDemo = isDemoRuntime
  const [ventana, setVentana] = useState(180)
  const [rendimiento, setRendimiento] = useState(null)
  const [alertas, setAlertas] = useState(null)
  const [cargando, setCargando] = useState(!esDemo)
  const [error, setError] = useState('')
  const [seccion, setSeccion] = useState('proveedores')

  const cargar = useCallback(async () => {
    if (esDemo) return
    setCargando(true)
    setError('')
    try {
      const desde = new Date(Date.now() - ventana * 86_400_000).toISOString()
      const [datos, avisos] = await Promise.all([
        resources.supplyPerformance.get({ desde }),
        resources.supplyAlerts.get(),
      ])
      setRendimiento(datos || null)
      setAlertas(avisos || null)
    } catch (causa) {
      setError(causa?.message || 'No se pudieron cargar las métricas.')
    } finally {
      setCargando(false)
    }
  }, [esDemo, ventana])

  useEffect(() => { cargar() }, [cargar])

  // El que más plata concentra va primero: es el proveedor que más pesa.
  const proveedores = useMemo(
    () => [...(rendimiento?.proveedores || [])].sort((a, b) => (b.costPyg || 0) - (a.costPyg || 0)),
    [rendimiento],
  )
  const rutas = useMemo(() => rendimiento?.rutas || [], [rendimiento])
  const atrasados = useMemo(() => alertas?.atrasados || [], [alertas])
  const vencidas = useMemo(() => alertas?.necesidadesVencidas || [], [alertas])
  const resumen = useMemo(() => resumenDeCompras(proveedores), [proveedores])
  const rutaCde = useMemo(() => resumenDeRutaCde(rutas), [rutas])
  const atrasosAhora = atrasados.length + vencidas.length

  const columnasProveedores = [
    {
      key: 'proveedor',
      label: 'Proveedor',
      render: (fila) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-fore" title={fila.proveedor}>{fila.proveedor}</span>
          <span className="block text-[11px] text-mute">{fila.compras} compra{fila.compras === 1 ? '' : 's'} · {fila.unidades} unidad{fila.unidades === 1 ? '' : 'es'}</span>
        </span>
      ),
    },
    { key: 'costPyg', label: 'Monto', align: 'right', render: (fila) => <CeldaMoneda valor={fila.costPyg} className="whitespace-nowrap text-fore" /> },
    {
      key: 'costoPromedioUnidadPyg',
      label: 'Costo por unidad',
      align: 'right',
      render: (fila) => (fila.costoPromedioUnidadPyg == null
        ? <span className="text-mute">—</span>
        : <CeldaMoneda valor={fila.costoPromedioUnidadPyg} tono="ok" className="whitespace-nowrap" />),
    },
    { key: 'plazoPromedioDias', label: 'Plazo', align: 'right', render: (fila) => <span className="whitespace-nowrap tabular-nums text-mute">{diasTexto(fila.plazoPromedioDias)}</span> },
    {
      key: 'puntualidadPct',
      label: 'Puntualidad',
      align: 'right',
      render: (fila) => (fila.puntualidadPct == null
        ? <span className="text-mute">—</span>
        : <Badge color={tonoPuntualidad(fila.puntualidadPct)}>{porcentajeTexto(fila.puntualidadPct)}</Badge>),
    },
    {
      key: 'problemas',
      label: 'Faltantes · incidencias',
      align: 'right',
      render: (fila) => <span className="whitespace-nowrap tabular-nums text-mute">{porcentajeTexto(fila.faltantesPct)} · {fila.incidencias}</span>,
    },
  ]

  const columnasRutas = [
    {
      key: 'ruta',
      label: 'Ruta',
      render: (fila) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-fore" title={fila.ruta}>{fila.ruta}</span>
          <span className="block text-[11px] text-mute">{fila.lotes} lote{fila.lotes === 1 ? '' : 's'} · {fila.unidades} unidad{fila.unidades === 1 ? '' : 'es'}</span>
        </span>
      ),
    },
    { key: 'metodo', label: 'Método', render: (fila) => <Badge color="slate">{fila.metodo}</Badge> },
    {
      key: 'diasPromedio',
      label: 'Días promedio',
      align: 'right',
      render: (fila) => <span className="whitespace-nowrap tabular-nums font-semibold text-fore">{diasTexto(fila.diasPromedio)}</span>,
    },
    { key: 'diasMaximos', label: 'Máximo', align: 'right', render: (fila) => <span className="whitespace-nowrap tabular-nums text-mute">{diasTexto(fila.diasMaximos)}</span> },
    {
      key: 'enTiempoPct',
      label: 'En tiempo',
      align: 'right',
      render: (fila) => (fila.enTiempoPct == null
        ? <span className="text-mute">—</span>
        : <Badge color={tonoPuntualidad(fila.enTiempoPct)}>{porcentajeTexto(fila.enTiempoPct)}</Badge>),
    },
    {
      key: 'atrasoPromedioDias',
      label: 'Atraso prom.',
      align: 'right',
      render: (fila) => (
        <span className={`whitespace-nowrap tabular-nums ${Number(fila.atrasoPromedioDias) > 0 ? 'text-bad' : 'text-mute'}`}>{diasTexto(fila.atrasoPromedioDias)}</span>
      ),
    },
  ]

  const columnasAtrasados = [
    { key: 'code', label: 'Lote', render: (fila) => <span className="font-medium text-fore">{fila.code}</span> },
    { key: 'compra', label: 'Compra', render: (fila) => <span className="text-mute">{fila.compra || '—'}</span> },
    { key: 'ruta', label: 'Ruta', render: (fila) => <span className="text-mute" title={`${fila.origen || '—'} → ${fila.destino || '—'}`}>{fila.origen || '—'} → {fila.destino || '—'}</span> },
    { key: 'metodo', label: 'Método', render: (fila) => <Badge color="slate">{fila.metodo || '—'}</Badge> },
    { key: 'estado', label: 'Estado', render: (fila) => <span className="text-mute">{ESTADO_ENVIO[fila.estado] || fila.estado || '—'}</span> },
    { key: 'eta', label: 'ETA', align: 'right', render: (fila) => <span className="tabular-nums text-mute">{fechaCorta(fila.eta)}</span> },
    {
      key: 'diasAtraso',
      label: 'Atraso',
      align: 'right',
      render: (fila) => <Badge color="red">{fila.diasAtraso} día{fila.diasAtraso === 1 ? '' : 's'}</Badge>,
    },
  ]

  const columnasVencidas = [
    { key: 'producto', label: 'Producto', render: (fila) => <span className="font-medium text-fore" title={fila.producto || ''}>{fila.producto || 'Producto'}</span> },
    { key: 'sucursal', label: 'Sucursal', render: (fila) => <span className="text-mute">{fila.sucursal || '—'}</span> },
    { key: 'quantity', label: 'Cantidad', align: 'right', render: (fila) => <span className="tabular-nums text-mute">{fila.quantity}</span> },
    {
      key: 'prioridad',
      label: 'Prioridad',
      render: (fila) => <Badge color={TONO_PRIORIDAD[fila.prioridad] || 'slate'}>{PRIORIDAD[fila.prioridad] || fila.prioridad || 'Normal'}</Badge>,
    },
    { key: 'prometidaEn', label: 'Prometida', align: 'right', render: (fila) => <span className="tabular-nums text-mute">{fechaCorta(fila.prometidaEn)}</span> },
    {
      key: 'diasVencidos',
      label: 'Vencida hace',
      align: 'right',
      render: (fila) => <Badge color="red">{fila.diasVencidos} día{fila.diasVencidos === 1 ? '' : 's'}</Badge>,
    },
  ]

  if (esDemo) {
    return (
      <Card className="p-4 md:p-5">
        <h2 className="font-semibold">Métricas de abastecimiento</h2>
        <p className="mt-1 text-sm text-mute">El rendimiento de proveedores y los tiempos de tránsito salen de las compras y recepciones de una cuenta real.</p>
      </Card>
    )
  }

  const tablas = [
    ['proveedores', `Proveedores (${proveedores.length})`],
    ['tiempos', `Tiempos (${rutas.length})`],
    ['atrasos', `Atrasos (${atrasosAhora})`],
  ]

  return (
    <div className="space-y-4" data-testid="metricas-abastecimiento">
      <Card className="p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold">Métricas de abastecimiento</h2>
            <p className="mt-1 text-sm text-mute">
              Rendimiento por proveedor con su costo real por unidad (moneda ya convertida), tiempos de
              tránsito —CDE → Asunción incluida— y atrasos del momento. La ventana filtra compras y lotes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="Ventana" className="w-auto" value={ventana} onChange={(evento) => setVentana(Number(evento.target.value))}>
              {VENTANAS.map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
            </Select>
            <Button type="button" variant="outline" onClick={cargar} disabled={cargando}>
              <Icon name="refresh" className="h-3.5 w-3.5" />Actualizar
            </Button>
          </div>
        </div>
        {rendimiento && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-mute">
            <Badge color="blue">{rendimiento.totales?.compras ?? 0} compras</Badge>
            <Badge color="slate">{rendimiento.totales?.envios ?? 0} envíos</Badge>
            <span>Actualizado {new Date().toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}
      </Card>

      {error && <ErrorState title="No se pudieron cargar las métricas" description={error} onRetry={cargar} />}

      {cargando && !rendimiento ? (
        <div className="space-y-2"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
      ) : (
        <>
          <div className={`${GRILLA_DOS_COLUMNAS} xl:grid-cols-4`} data-testid="metricas-resumen">
            <Stat
              label="Monto comprado"
              valor={gs(resumen.montoPyg)}
              sub={`${resumen.unidades} unidad${resumen.unidades === 1 ? '' : 'es'} en la ventana`}
            />
            <Stat
              label="Costo por unidad"
              valor={resumen.costoPromedioUnidadPyg == null ? '—' : gs(resumen.costoPromedioUnidadPyg)}
              sub="Promedio real, moneda convertida"
            />
            <Stat
              label="Atrasos ahora"
              valor={atrasosAhora}
              sub={`${atrasados.length} lote${atrasados.length === 1 ? '' : 's'} · ${vencidas.length} promesa${vencidas.length === 1 ? '' : 's'}`}
            />
            <Stat
              label="Ruta CDE"
              valor={rutaCde ? diasTexto(rutaCde.diasPromedio) : '—'}
              sub={rutaCde
                ? `${rutaCde.lotes} lote${rutaCde.lotes === 1 ? '' : 's'} medidos${rutaCde.enTiempoPct == null ? '' : ` · ${rutaCde.enTiempoPct}% en fecha`}`
                : 'Sin llegadas medidas en la ventana'}
            />
          </div>

          <Subtabs value={seccion} onChange={setSeccion} className="mb-0 w-full" items={tablas} />

          {seccion === 'proveedores' && (
            <Card className="overflow-hidden">
              <div className="border-b border-ink-600 px-4 py-3">
                <h3 className="font-semibold">Rendimiento por proveedor</h3>
                <p className="mt-0.5 text-xs text-mute">Compras de la ventana: cuánto se compró, a qué costo real por unidad, en cuánto tiempo repuso y con cuántos problemas.</p>
              </div>
              <div className="p-3" data-testid="metricas-proveedores-tabla">
                <DataTable
                  columns={columnasProveedores}
                  rows={proveedores.map((fila) => ({ ...fila, key: fila.supplierId || `s-${fila.proveedor}` }))}
                  emptyLabel="Todavía no hay compras en la ventana."
                  mobileCard={(fila) => (
                    <Card className="p-3">
                      <p className="truncate font-semibold" title={fila.proveedor}>{fila.proveedor}</p>
                      <div className="mt-2 space-y-1 text-xs">
                        <FilaDato etiqueta="Monto" valor={<CeldaMoneda valor={fila.costPyg} />} />
                        <FilaDato etiqueta="Costo por unidad" valor={fila.costoPromedioUnidadPyg == null ? '—' : <CeldaMoneda valor={fila.costoPromedioUnidadPyg} tono="ok" />} />
                        <FilaDato etiqueta="Compras · unidades" valor={`${fila.compras} · ${fila.unidades}`} />
                        <FilaDato etiqueta="Plazo" valor={diasTexto(fila.plazoPromedioDias)} />
                        <FilaDato etiqueta="Puntualidad" valor={fila.puntualidadPct == null ? '—' : `${fila.puntualidadPct}%`} />
                        <FilaDato etiqueta="Faltantes · incidencias" valor={`${porcentajeTexto(fila.faltantesPct)} · ${fila.incidencias}`} />
                      </div>
                    </Card>
                  )}
                />
              </div>
            </Card>
          )}

          {seccion === 'tiempos' && (
            <Card className="overflow-hidden">
              <div className="border-b border-ink-600 px-4 py-3">
                <h3 className="font-semibold">Tiempos de tránsito por ruta</h3>
                <p className="mt-0.5 text-xs text-mute">Días reales desde el despacho a la llegada, puntualidad contra la ETA y atraso promedio cuando se atrasa.</p>
              </div>
              <div className="p-3" data-testid="metricas-tiempos-tabla">
                <DataTable
                  columns={columnasRutas}
                  rows={rutas.map((fila) => ({ ...fila, key: `${fila.ruta}-${fila.metodo}` }))}
                  emptyLabel="Todavía no hay lotes despachados en la ventana."
                  mobileCard={(fila) => (
                    <Card className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate font-semibold" title={fila.ruta}>{fila.ruta}</p>
                        <Badge color="slate">{fila.metodo}</Badge>
                      </div>
                      <div className="mt-2 space-y-1 text-xs">
                        <FilaDato etiqueta="Días promedio" valor={diasTexto(fila.diasPromedio)} />
                        <FilaDato etiqueta="Máximo" valor={diasTexto(fila.diasMaximos)} />
                        <FilaDato etiqueta="Lotes · unidades" valor={`${fila.lotes} · ${fila.unidades}`} />
                        <FilaDato etiqueta="En tiempo" valor={fila.enTiempoPct == null ? '—' : `${fila.enTiempoPct}%`} />
                        <FilaDato etiqueta="Atraso promedio" valor={diasTexto(fila.atrasoPromedioDias)} />
                      </div>
                    </Card>
                  )}
                />
              </div>
            </Card>
          )}

          {seccion === 'atrasos' && (
            <div className="space-y-3">
              <Card className="overflow-hidden">
                <div className="border-b border-ink-600 px-4 py-3">
                  <h3 className="font-semibold">Lotes atrasados</h3>
                  <p className="mt-0.5 text-xs text-mute">Lotes sin llegar con la ETA vencida, para reclamar o repriorizar.</p>
                </div>
                <div className="p-3" data-testid="metricas-atrasados-tabla">
                  <DataTable
                    columns={columnasAtrasados}
                    rows={atrasados.map((fila) => ({ ...fila, key: fila.id || fila.code }))}
                    emptyLabel="Ningún lote atrasado ahora."
                    mobileCard={(fila) => (
                      <Card className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 truncate font-semibold">{fila.code}</p>
                          <Badge color="red">{fila.diasAtraso} día{fila.diasAtraso === 1 ? '' : 's'}</Badge>
                        </div>
                        <div className="mt-2 space-y-1 text-xs">
                          <FilaDato etiqueta="Compra" valor={fila.compra || '—'} />
                          <FilaDato etiqueta="Ruta" valor={`${fila.origen || '—'} → ${fila.destino || '—'}`} />
                          <FilaDato etiqueta="Método" valor={fila.metodo || '—'} />
                          <FilaDato etiqueta="ETA" valor={fechaHora(fila.eta)} />
                        </div>
                      </Card>
                    )}
                  />
                </div>
              </Card>

              <Card className="overflow-hidden">
                <div className="border-b border-ink-600 px-4 py-3">
                  <h3 className="font-semibold">Promesas vencidas</h3>
                  <p className="mt-0.5 text-xs text-mute">Necesidades con la fecha prometida al cliente ya pasada.</p>
                </div>
                <div className="p-3" data-testid="metricas-vencidas-tabla">
                  <DataTable
                    columns={columnasVencidas}
                    rows={vencidas.map((fila) => ({ ...fila, key: fila.id }))}
                    emptyLabel="Ninguna promesa vencida ahora."
                    mobileCard={(fila) => (
                      <Card className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 truncate font-semibold" title={fila.producto || ''}>{fila.producto || 'Producto'}</p>
                          <Badge color="red">{fila.diasVencidos} día{fila.diasVencidos === 1 ? '' : 's'}</Badge>
                        </div>
                        <div className="mt-2 space-y-1 text-xs">
                          <FilaDato etiqueta="Sucursal" valor={fila.sucursal || '—'} />
                          <FilaDato etiqueta="Cantidad" valor={fila.quantity} />
                          <FilaDato etiqueta="Prioridad" valor={PRIORIDAD[fila.prioridad] || fila.prioridad || 'Normal'} />
                          <FilaDato etiqueta="Prometida" valor={fechaCorta(fila.prometidaEn)} />
                        </div>
                      </Card>
                    )}
                  />
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  )
}
