import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useUrlState } from '@/hooks/useUrlState'
import { api } from '@/lib/api'
import { isDemoRuntime } from '@/lib/demoMode'
import { useSesion } from '@/lib/sesion'
import { gs, variacion } from '@/utils/calculos'
import { Badge, Button, Card, DataTable, EmptyState, Select, Stat } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import RangoFechas, { PRESETS, rangoDeParams, paramsDeRango, etiquetaRango } from '@/components/shared/RangoFechas'
import { formatPercent } from '@/components/shared/PercentField'
import { descargarCsv } from '@/utils/descargarCsv'
import {
  GRUPOS,
  columnasReporte,
  esGrupoPorLinea,
  filasCsv,
  filasReporte,
  nombreArchivoCsv,
  rangoValido,
} from '@/utils/reportes'

const rangoInicial = () => ({ ...(PRESETS.find((p) => p.id === '30d') || PRESETS[0]).calc(), preset: '30d' })

// Paraguay quedó en UTC-3 fijo. El desfase define qué cuenta como "día" del
// negocio; no se deduce del navegador para que todos vean el mismo corte.
const TZ_OFFSET = -180

export default function Reportes() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [rango, setRango] = useState(() => rangoDeParams(searchParams, rangoInicial))
  const cambiarRango = useCallback(
    next => {
      setRango(next)
      setSearchParams(actuales => paramsDeRango(next, actuales), { replace: true })
    },
    [setSearchParams],
  )
  const [grupo, setGrupo] = useUrlState('grupo', 'product')
  const [tipo, setTipo] = useUrlState('tipo', 'ventas')
  const [datos, setDatos] = useState(null)
  const [datosComisiones, setDatosComisiones] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [exportando, setExportando] = useState(false)
  const [exportError, setExportError] = useState('')
  const { sesion, sucursal } = useSesion()
  const puedeComisiones = Boolean(sesion?.esPropietario || sesion?.rol === 'GERENTE')

  // Descarta respuestas atrasadas cuando cambia el período o la agrupación.
  const pedidoRef = useRef(0)

  const cargar = useCallback(async () => {
    // La demo es una copia aislada en el navegador, sin token ni datos reales.
    // Se evita la llamada para no mostrar un error de red sin sentido.
    if (isDemoRuntime) {
      setCargando(false)
      return
    }
    const { desde, hasta } = rango
    if (!rangoValido(desde, hasta)) {
      setError('El rango de fechas no es válido.')
      setCargando(false)
      return
    }
    const id = pedidoRef.current + 1
    pedidoRef.current = id
    setCargando(true)
    setError('')
    try {
      if (tipo === 'comisiones') {
        const params = new URLSearchParams({ type: 'commissions', from: desde, to: hasta, tzOffset: String(TZ_OFFSET) })
        if (sucursal?.id) params.set('branchId', sucursal.id)
        const respuesta = await api.get(`/api/reports?${params}`)
        if (pedidoRef.current !== id) return
        setDatosComisiones(respuesta)
      } else {
        const respuesta = await api.get(
          `/api/reports?from=${desde}&to=${hasta}&groupBy=${grupo}&tzOffset=${TZ_OFFSET}`,
        )
        if (pedidoRef.current !== id) return
        setDatos(respuesta)
      }
    } catch (e) {
      if (pedidoRef.current !== id) return
      setDatos(null)
      setDatosComisiones(null)
      setError(e?.message || 'No se pudo generar el reporte.')
    } finally {
      if (pedidoRef.current === id) setCargando(false)
    }
  }, [rango, grupo, tipo, sucursal?.id])

  useEffect(() => {
    cargar()
  }, [cargar])

  const totales = datos?.totals || null
  const grupos = datos?.groups || []
  const columnas = columnasReporte(grupo)
  const porLinea = esGrupoPorLinea(grupo)
  // Columnas para DataTable: mismos encabezados, alineación y clases por tipo
  // que la tabla escrita a mano.
  const columnasTabla = columnas.map((c) => ({
    key: c.key,
    label: c.label,
    align: c.tipo === 'texto' ? undefined : 'right',
    render: (g) => c.tipo === 'texto'
      ? <span className="font-medium text-fore">{g[c.key]}</span>
      : <span className="tabular-nums text-mute">{c.tipo === 'monto' ? gs(g[c.key]) : g[c.key]}</span>,
  }))

  async function exportar() {
    if (tipo === 'comisiones') {
      // Las comisiones se exportan en el servidor para que el CSV respete el
      // período y el alcance por sucursal exactamente igual que la tabla.
      setExportando(true); setExportError('')
      try {
        const { desde, hasta } = rango
        await descargarCsv(
          'commissions',
          { desde, hasta, ...(sucursal?.id ? { branchId: sucursal.id } : {}) },
          `mobos-reporte-comisiones-${desde || 'inicio'}-a-${hasta || 'hoy'}.csv`,
        )
      } catch (e) { setExportError(e?.message || 'No se pudo exportar el CSV.') } finally { setExportando(false) }
      return
    }
    if (!datos) return
    const { encabezados, filas } = filasReporte(datos, grupo)
    const csv = filasCsv(encabezados, filas)
    // BOM para que Excel respete los acentos.
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = nombreArchivoCsv({ desde: datos.from, hasta: datos.to, groupBy: grupo })
    document.body.appendChild(enlace)
    enlace.click()
    enlace.remove()
    URL.revokeObjectURL(url)
  }

  if (isDemoRuntime) {
    return (
      <Card>
        <div className="flex items-start gap-3">
          <Icon name="info" className="mt-0.5 h-5 w-5 text-fono" />
          <div>
            <div className="font-semibold text-fore">Reportes sobre datos reales</div>
            <p className="mt-1 text-sm text-mute">
              Este apartado lee las ventas, los cobros y los costos reales de tu tienda. La demo es una
              copia aislada en este navegador y no se conecta a la base, así que acá no se muestran
              cifras: preferimos no inventarlas. Al entrar con tu cuenta real vas a ver el período
              completo con exportación a CSV.
            </p>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <RangoFechas valor={rango} onChange={cambiarRango} />
          <Select value={tipo} onChange={(e) => setTipo(e.target.value)} className="h-9 w-auto">
            <option value="ventas">Ventas</option>
            {puedeComisiones && <option value="comisiones">Comisiones por vendedor</option>}
          </Select>
          {tipo !== 'comisiones' && (
            <Select value={grupo} onChange={(e) => setGrupo(e.target.value)} className="h-9 w-auto">
              {GRUPOS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.plural}
                </option>
              ))}
            </Select>
          )}
          <Button variant="outline" onClick={cargar} disabled={cargando}>
            <Icon name="refresh" className={cargando ? 'animate-spin' : ''} />
            {cargando ? 'Cargando…' : 'Actualizar'}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="h-9 px-3 text-xs" onClick={exportar} disabled={exportando || (!datos && !datosComisiones)}>
            <Icon name="download" />
            {exportando ? 'Exportando…' : 'Exportar CSV'}
          </Button>
          <Button variant="outline" onClick={() => window.print()} disabled={!datos || !grupos.length}>
            <Icon name="report" />
            Imprimir
          </Button>
        </div>
      </Card>

      {exportError && (
        <Card className="border-bad/40 bg-bad/10">
          <div className="flex items-start gap-3">
            <Icon name="alert" className="mt-0.5 h-5 w-5 text-bad" />
            <p className="text-sm text-bad">{exportError}</p>
          </div>
        </Card>
      )}

      {error && (
        <Card className="border-bad/40 bg-bad/10">
          <div className="flex items-start gap-3">
            <Icon name="alert" className="mt-0.5 h-5 w-5 text-bad" />
            <div className="flex-1">
              <div className="font-semibold text-fore">No se pudo cargar el reporte</div>
              <p className="mt-1 text-sm text-mute">{error}</p>
            </div>
            <Button variant="outline" onClick={cargar}>Reintentar</Button>
          </div>
        </Card>
      )}

      {datosComisiones && tipo === 'comisiones' && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Ventas del período" valor={gs(datosComisiones.totals?.totalPyg || 0)} sub={`${etiquetaRango(rango)}`} />
            <Stat label="Margen" valor={gs(datosComisiones.totals?.marginPyg || 0)} sub="Sobre ventas con costo congelado" />
            <Stat label="Comisión total" valor={gs(datosComisiones.totals?.commissionPyg || 0)} sub="Según reglas vigentes" />
          </div>

          {datosComisiones.truncated && <Badge color="red">El período supera el tope de ventas analizadas</Badge>}

          {!datosComisiones.sellers?.length ? (
            <Card>
              <EmptyState
                icon="report"
                title="Sin ventas en el período"
                description="Probá con otro rango de fechas o revisá que las ventas estén confirmadas en el POS."
                className="p-0"
              />
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <DataTable
                columns={[
                  { key: 'sellerName', label: 'Vendedor', render: (fila) => <span className="font-medium text-fore">{fila.sellerName || 'Sin vendedor'}</span> },
                  { key: 'totalPyg', label: 'Ventas', align: 'right', render: (fila) => <span className="tabular-nums text-mute">{gs(fila.totalPyg)}</span> },
                  { key: 'marginPyg', label: 'Margen', align: 'right', render: (fila) => <span className="tabular-nums text-mute">{gs(fila.marginPyg)}</span> },
                  { key: 'commissionPct', label: '% comisión', align: 'right', render: (fila) => <span className="tabular-nums text-mute">{fila.commissionPct === null ? '—' : `${formatPercent(fila.commissionPct)}%`}</span> },
                  { key: 'commissionPyg', label: 'Comisión', align: 'right', render: (fila) => <span className="tabular-nums font-semibold text-fore">{gs(fila.commissionPyg)}</span> },
                ]}
                rows={datosComisiones.sellers.map((fila) => ({ ...fila, key: fila.sellerId }))}
                mobileCard={(fila) => (
                  <Card className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-[13px] font-semibold text-fore">{fila.sellerName || 'Sin vendedor'}</div>
                      <Badge color={fila.commissionPct === null ? 'slate' : 'green'}>{fila.commissionPct === null ? 'Sin regla' : `${formatPercent(fila.commissionPct)}%`}</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Linea label="Ventas" valor={gs(fila.totalPyg)} />
                      <Linea label="Órdenes" valor={fila.orders} />
                      <Linea label="Margen" valor={gs(fila.marginPyg)} />
                      <Linea label="Comisión" valor={gs(fila.commissionPyg)} />
                    </div>
                  </Card>
                )}
              />
            </Card>
          )}

          <p className="text-xs text-mute">
            La comisión se calcula sobre el margen de cada venta usando las reglas vigentes; la regla por usuario prevalece
            sobre la de rol. Generado {datosComisiones.generatedAt ? new Date(datosComisiones.generatedAt).toLocaleString('es-PY') : ''}.
          </p>
        </>
      )}

      {totales && tipo !== 'comisiones' && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 min-[1200px]:grid-cols-4">
            <Stat
              destacado
              label="Total del período"
              valor={gs(totales.totalPyg)}
              sub={`${totales.orders} ventas · ${etiquetaRango(rango)}`}
            />
            <Stat label="Cobrado" valor={gs(totales.collectedPyg)} sub={totales.pendingPyg > 0 ? `Saldo ${gs(totales.pendingPyg)}` : 'Sin saldo pendiente'} />
            <Stat
              label="Margen real"
              valor={gs(totales.netProfitPyg ?? totales.profitPyg)}
              sub={totales.netMarginPct === null ? 'Sin costos cargados' : `Margen neto ${formatPercent(totales.netMarginPct)}%`}
            />
            <Stat label="Costo de mercadería" valor={gs(totales.costPyg)} sub={`${totales.units} unidades`} />
          </div>

          {datos.previous?.totals && (
            <div className="flex flex-wrap items-center gap-2">
              {(() => {
                const previo = datos.previous.totals
                return [
                  ['Ventas', totales.totalPyg, previo.totalPyg],
                  ['Cobrado', totales.collectedPyg, previo.collectedPyg],
                  ['Pedidos', totales.orders, previo.orders],
                ].map(([label, actual, anterior]) => {
                  const delta = variacion(actual, anterior)
                  if (delta === null) return null
                  return (
                    <Badge key={label} color={delta >= 0 ? 'green' : 'red'}>
                      {label} {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}% vs período anterior
                    </Badge>
                  )
                })
              })()}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {totales.discountPyg > 0 && <Badge color="orange">Descuentos {gs(totales.discountPyg)}</Badge>}
            {totales.deliveryPyg > 0 && <Badge color="blue">Delivery {gs(totales.deliveryPyg)}</Badge>}
            {totales.commissionPyg > 0 && <Badge color="orange">Comisiones de cobro {gs(totales.commissionPyg)}</Badge>}
            {totales.linesWithoutCost > 0 && (
              <Badge color="slate">
                {totales.linesWithoutCost} línea{totales.linesWithoutCost === 1 ? '' : 's'} sin costo ({gs(totales.salesWithoutCostPyg)}) — no suman a la ganancia
              </Badge>
            )}
            {datos.truncated && <Badge color="red">El período supera el tope de ventas analizadas</Badge>}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Stat label="Rotación del período" valor={datos.inventory?.sellThroughPct === null || datos.inventory?.sellThroughPct === undefined ? '—' : `${formatPercent(datos.inventory.sellThroughPct)}%`} sub={`${datos.inventory?.soldUnits ?? 0} unidades vendidas${datos.inventory?.daysOfStock === null || datos.inventory?.daysOfStock === undefined ? '' : ` · ${datos.inventory.daysOfStock} días de stock`}`} />
            <Stat label="Stock actual" valor={`${datos.inventory?.onHandUnits ?? 0} u.`} sub={`Valorizado ${gs(datos.inventory?.stockValuePyg ?? 0)}${datos.inventory?.stockWithoutCost ? ` · ${datos.inventory.stockWithoutCost} sin costo` : ''}`} />
            <Stat label="Faltantes" valor={`${datos.inventory?.shortages?.length ?? 0}`} sub={(datos.inventory?.shortages || []).slice(0, 2).map((p) => p.name).join(' · ') || 'Sin faltantes'} />
          </div>

          {grupos.length === 0 ? (
            <Card>
              <EmptyState
                icon="report"
                title="Sin ventas en el período"
                description="Probá con otro rango de fechas o revisá que las ventas estén confirmadas en el POS."
                className="p-0"
              />
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <DataTable
                columns={columnasTabla}
                rows={grupos}
                mobileCard={(g) => (
                  <Card className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-[13px] font-semibold text-fore">{g.label}</div>
                      <Badge color="slate">{g.units} u.</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Linea label={porLinea ? 'Venta' : 'Total'} valor={gs(porLinea ? g.grossPyg : g.totalPyg)} />
                      <Linea label="Costo" valor={gs(g.costPyg)} />
                      <Linea label="Ganancia" valor={gs(g.profitPyg)} />
                      <Linea label="Sin costo" valor={gs(g.salesWithoutCostPyg)} />
                      {!porLinea && <Linea label="Cobrado" valor={gs(g.collectedPyg)} />}
                      {!porLinea && <Linea label="Saldo" valor={gs(g.pendingPyg)} />}
                    </div>
                  </Card>
                )}
              />
            </Card>
          )}

          {grupo === 'product' && grupos.length > 0 && (
            <Card className="overflow-x-auto p-0">
              <div className="flex items-center justify-between border-b border-ink-600 p-4">
                <h3 className="font-semibold">Curva ABC y antigüedad</h3>
                <span className="text-xs text-mute">A: 80% acumulado · B: 95% · C: resto</span>
              </div>
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="border-b border-ink-600 text-left text-[11px] uppercase tracking-wider text-mute"><th className="px-4 py-3">Producto</th><th className="px-4 py-3 text-right">Venta</th><th className="px-4 py-3 text-right">% acum.</th><th className="px-4 py-3">Clase</th><th className="px-4 py-3 text-right">Disponibles</th><th className="px-4 py-3 text-right">Antigüedad</th></tr></thead>
                <tbody>{(() => {
                  // La clase ABC y el % acumulado vienen del servidor (#171):
                  // la portada ejecutiva y esta tabla comparten el criterio.
                  // El cálculo local queda solo como respaldo de compatibilidad.
                  const totalVenta = grupos.reduce((suma, g) => suma + Number(g.grossPyg || 0), 0) || 1
                  let acumulado = 0
                  const filas = [...grupos].sort((a, b) => Number(b.grossPyg || 0) - Number(a.grossPyg || 0)).map(g => {
                    acumulado += Number(g.grossPyg || 0)
                    const pct = g.accumulatedPct === null || g.accumulatedPct === undefined ? (acumulado / totalVenta) * 100 : Number(g.accumulatedPct)
                    const clase = g.abcClass || (pct <= 80 ? 'A' : pct <= 95 ? 'B' : 'C')
                    const dias = g.oldestUnitAt ? Math.max(0, Math.floor((Date.now() - new Date(g.oldestUnitAt).getTime()) / 86400000)) : null
                    return { g, pct, clase, dias }
                  })
                  return filas.map(({ g, pct, clase, dias }) => (
                    <tr key={g.key} className="border-b border-ink-700/60 last:border-0">
                      <td className="px-4 py-2.5 font-medium text-fore">{g.label}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-mute">{gs(g.grossPyg)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-mute">{pct.toFixed(1)}%</td>
                      <td className="px-4 py-2.5"><Badge color={clase === 'A' ? 'green' : clase === 'B' ? 'orange' : 'slate'}>{clase}</Badge></td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-mute">{g.availableUnits ?? 0}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-mute">{dias === null ? '—' : `${dias} días`}</td>
                    </tr>
                  ))
                })()}</tbody>
              </table>
            </Card>
          )}

          <p className="text-xs text-mute">
            {porLinea
              ? 'Producto y categoría se calculan por línea: el descuento global y los cobros pertenecen a la orden y no se reparten. '
              : 'Día y vendedor se calculan por orden, con cobros y saldo reales. '}
            El margen real descuenta costos congelados y comisiones conocidas; no estima costos históricos ausentes. Generado{' '}
            {datos.generatedAt ? new Date(datos.generatedAt).toLocaleString('es-PY') : ''}.
          </p>
        </>
      )}
    </div>
  )
}

function Linea({ label, valor }) {
  return (
    <div className="rounded-lg bg-ink-700/40 px-2.5 py-1.5">
      <div className="text-[11px] uppercase tracking-wider text-mute">{label}</div>
      <div className="text-[13px] font-semibold tabular-nums text-fore">{valor}</div>
    </div>
  )
}
