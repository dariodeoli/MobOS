import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useUrlState } from '@/hooks/useUrlState'
import { useSesion } from '@/lib/sesion'
import { listVentas, listGastos, listAds, productosById } from '@/lib/storage'
import { gs, variacion } from '@/utils/calculos'
import { fechaHora } from '@/utils/fecha'
import { descargarCsvCliente } from '@/utils/descargarArchivo'
import { gananciaDeRango, lineasDeGanancia, serieDeReporte } from '@/utils/ganancias'
import { reporteMetricas } from '@/lib/metricas'
import { Badge, Button, Card, CeldaMoneda, EmptyState, Select, Stat } from '@/components/ui'
import StatGrid from '@/components/shared/StatGrid'
import Icon from '@/components/shared/Icon'
import RangoFechas, { PRESETS, rangoDeParams, paramsDeRango, etiquetaRango } from '@/components/shared/RangoFechas'
import CalendarioGanancias, { LineaValor } from '@/components/shared/CalendarioGanancias'
import { formatPercent } from '@/components/shared/PercentField'
import { descargarCsv } from '@/utils/descargarCsv'
import { useUltimoUsado } from '@/hooks/useUltimoUsado'
import { CLAVES_FIN, rangoDePreset } from '@/lib/finUltimoUsado'
import {
  GRUPOS,
  columnasReporte,
  esGrupoPorLinea,
  filasCsv,
  filasReporte,
  filasImpresion,
  nombreArchivoCsv,
  rangoValido,
} from '@/utils/reportes'
import ListaDensa from '@/components/shared/ListaDensa'
import { usePaginaLista } from '@/components/shared/usePaginaLista'
import Toolbar from '@/components/shared/Toolbar'
import StatusChip from '@/components/shared/StatusChip'
import { CELDA_NUMERO } from '@/components/shared/tabla'
import { cn } from '@/lib/utils'
import './finanzasTactil.css'

// Todos los botones de la barra miden lo mismo: 44px bajo lg y 36px en escritorio.
const BOTON_CONTROL = 'md:h-11 lg:h-9'

const rangoInicial = () => ({ ...(PRESETS.find((p) => p.id === '30d') || PRESETS[0]).calc(), preset: '30d' })

export default function Reportes() {
  const [searchParams, setSearchParams] = useSearchParams()
  // #209: el período arranca con el último preset usado en Finanzas/Análisis.
  const [presetRecordado, recordarPreset] = useUltimoUsado(CLAVES_FIN.rango, '30d')
  const [rango, setRango] = useState(() => rangoDeParams(searchParams, () => rangoDePreset(PRESETS, presetRecordado, rangoInicial)))
  const cambiarRango = useCallback(
    next => {
      setRango(next)
      if (next?.preset) recordarPreset(next.preset)
      setSearchParams(actuales => paramsDeRango(next, actuales), { replace: true })
    },
    [setSearchParams, recordarPreset],
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
      // Un solo adaptador de métricas (#181/#171): él arma el tzOffset y la
      // sucursal. El reporte de ventas conserva el alcance de siempre (sin
      // acotar por sucursal) para no cambiar los números actuales.
      if (tipo === 'comisiones') {
        const respuesta = await reporteMetricas({ rango: { desde, hasta }, branchId: sucursal?.id, groupBy: grupo, type: 'commissions' })
        if (pedidoRef.current !== id) return
        setDatosComisiones(respuesta)
      } else {
        const respuesta = await reporteMetricas({ rango: { desde, hasta }, groupBy: grupo })
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

  // Serie diaria para el calendario compartido: mismo reporte y mismos
  // cálculos que Ganancias, con el rango elegido en Reportes.
  const [serieGanancia, setSerieGanancia] = useState(null)
  useEffect(() => {
    if (tipo === 'comisiones' || !rangoValido(rango.desde, rango.hasta)) { setSerieGanancia(null); return }
    let vigente = true
    reporteMetricas({ rango, groupBy: 'day' })
      .then((data) => { if (vigente) setSerieGanancia(serieDeReporte(data)) })
      .catch(() => { if (vigente) setSerieGanancia(null) })
    return () => { vigente = false }
  }, [rango, tipo])

  const totales = datos?.totals || null
  const grupos = useMemo(() => datos?.groups || [], [datos])
  // Resultado por día (#181): Reportes reutiliza el calendario y los cálculos
  // de Ganancias. Ingresos/costo del reporte diario; gastos y publicidad de
  // Finanzas, con las mismas fórmulas que Análisis → Ganancias.
  const datosGanancia = {
    ventas: listVentas(),
    gastos: listGastos(),
    ads: listAds(),
    prodsById: productosById(),
  }
  const gananciaPeriodo = tipo === 'comisiones' || !totales ? null : gananciaDeRango(rango, datosGanancia, totales)
  const columnas = columnasReporte(grupo)
  const porLinea = esGrupoPorLinea(grupo)
  // Columnas del listado: mismos encabezados y alineación que antes. Texto
  // flexible; los montos con piso en rem para que nunca se corte una cifra.
  const columnasTabla = columnas.map((c) => ({
    key: c.key,
    header: c.label,
    align: c.tipo === 'texto' ? undefined : 'right',
    dinero: c.tipo === 'monto',
    ancho: c.tipo === 'texto' ? 'minmax(0,1.6fr)' : c.tipo === 'monto' ? 'minmax(8.5rem,1fr)' : 'minmax(4.5rem,0.6fr)',
    className: c.tipo === 'texto' ? 'font-medium text-fore' : 'text-xs text-mute',
    cell: (g) => (c.tipo === 'monto' ? gs(g[c.key]) : g[c.key]),
  }))
  const listaGrupos = usePaginaLista(grupos, { tamano: { compacto: 8, amplio: 20 } })
  const vendedores = datosComisiones?.sellers || []
  const listaVendedores = usePaginaLista(vendedores, { tamano: { compacto: 8, amplio: 20 } })
  // Curva ABC (#171): la clase y el % acumulado vienen del servidor; el
  // cálculo local queda solo como respaldo de compatibilidad.
  const filasAbc = useMemo(() => {
    const totalVenta = grupos.reduce((suma, g) => suma + Number(g.grossPyg || 0), 0) || 1
    let acumulado = 0
    return [...grupos].sort((a, b) => Number(b.grossPyg || 0) - Number(a.grossPyg || 0)).map((g) => {
      acumulado += Number(g.grossPyg || 0)
      const pct = g.accumulatedPct === null || g.accumulatedPct === undefined ? (acumulado / totalVenta) * 100 : Number(g.accumulatedPct)
      const clase = g.abcClass || (pct <= 80 ? 'A' : pct <= 95 ? 'B' : 'C')
      const dias = g.oldestUnitAt ? Math.max(0, Math.floor((Date.now() - new Date(g.oldestUnitAt).getTime()) / 86400000)) : null
      return { g, key: g.key, pct, clase, dias }
    })
  }, [grupos])
  const listaAbc = usePaginaLista(filasAbc, { tamano: { compacto: 8, amplio: 20 } })

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
    descargarCsvCliente(nombreArchivoCsv({ desde: datos.from, hasta: datos.to, groupBy: grupo }), csv)
  }

  return (
    <div className="finanzas-tactil space-y-4">
      <Card className="p-3">
        <Toolbar
          plano
          label="Controles del reporte"
          testId="reportes-toolbar"
          filters={(
            <>
              <RangoFechas valor={rango} onChange={cambiarRango} className="[&>button]:h-11 lg:[&>button]:h-9" />
              <Select aria-label="Tipo de reporte" value={tipo} onChange={(e) => setTipo(e.target.value)} className="h-11 w-auto lg:h-9">
                <option value="ventas">Ventas</option>
                {puedeComisiones && <option value="comisiones">Comisiones por vendedor</option>}
              </Select>
              {tipo !== 'comisiones' && (
                <Select aria-label="Agrupar por" value={grupo} onChange={(e) => setGrupo(e.target.value)} className="h-11 w-auto lg:h-9">
                  {GRUPOS.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.plural}
                    </option>
                  ))}
                </Select>
              )}
              <Button variant="outline" className={BOTON_CONTROL} onClick={cargar} disabled={cargando}>
                <Icon name="refresh" className={cargando ? 'animate-spin' : ''} />
                {cargando ? 'Cargando…' : 'Actualizar'}
              </Button>
            </>
          )}
          more={(
            <Button variant="outline" className={BOTON_CONTROL} onClick={() => window.print()} disabled={!datos || !grupos.length}>
              <Icon name="report" />
              Imprimir
            </Button>
          )}
          primary={(
            <Button variant="outline" className={BOTON_CONTROL} onClick={exportar} disabled={exportando || (!datos && !datosComisiones)}>
              <Icon name="download" />
              {exportando ? 'Exportando…' : 'Exportar CSV'}
            </Button>
          )}
        />
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
          <StatGrid columnas={3}>
            <Stat compact label="Ventas del período" valor={gs(datosComisiones.totals?.totalPyg || 0)} sub={`${etiquetaRango(rango)}`} />
            <Stat compact label="Margen" valor={gs(datosComisiones.totals?.marginPyg || 0)} sub="Sobre ventas con costo congelado" />
            <Stat compact className="col-span-2 md:col-span-1" label="Comisión total" valor={gs(datosComisiones.totals?.commissionPyg || 0)} sub="Según reglas vigentes" />
          </StatGrid>

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
            <ListaDensa
              lista={listaVendedores}
              testId="reportes-comisiones-tabla"
              className="print:hidden"
              etiquetaTabla="Comisiones por vendedor"
              etiquetaPie="Páginas de vendedores"
              unidad="vendedores"
              obtenerClave={(fila) => fila.sellerId}
              columns={[
                { key: 'sellerName', header: 'Vendedor', ancho: 'minmax(0,1.6fr)', className: 'font-medium text-fore', cell: (fila) => fila.sellerName || 'Sin vendedor' },
                { key: 'totalPyg', dinero: true, header: 'Ventas', align: 'right', ancho: 'minmax(8.5rem,1fr)', className: 'text-xs text-mute', cell: (fila) => gs(fila.totalPyg) },
                { key: 'marginPyg', dinero: true, header: 'Margen', align: 'right', ancho: 'minmax(8.5rem,1fr)', className: 'text-xs text-mute', cell: (fila) => gs(fila.marginPyg) },
                { key: 'commissionPct', header: '% comisión', align: 'right', ancho: '6rem', className: 'text-xs text-mute', cell: (fila) => (fila.commissionPct === null ? '—' : `${formatPercent(fila.commissionPct)}%`) },
                { key: 'commissionPyg', dinero: true, header: 'Comisión', align: 'right', ancho: 'minmax(8.5rem,1fr)', className: 'text-xs font-semibold text-fore', cell: (fila) => gs(fila.commissionPyg) },
              ]}
              renderCard={(fila) => (
                <Card className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-[13px] font-semibold text-fore">{fila.sellerName || 'Sin vendedor'}</div>
                    <StatusChip tono={fila.commissionPct === null ? 'neutral' : 'ok'} etiqueta={fila.commissionPct === null ? 'Sin regla' : `${formatPercent(fila.commissionPct)}%`} />
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
          )}

          <TablaImpresion
            testId="reportes-comisiones-impresion"
            titulo="Comisiones por vendedor (completo)"
            encabezados={['Vendedor', 'Ventas', 'Margen', '% comisión', 'Comisión']}
            filas={vendedores.map((f) => [f.sellerName || 'Sin vendedor', gs(f.totalPyg), gs(f.marginPyg), f.commissionPct === null ? '—' : `${formatPercent(f.commissionPct)}%`, gs(f.commissionPyg)])}
          />

          <p className="text-xs text-mute">
            La comisión se calcula sobre el margen de cada venta usando las reglas vigentes; la regla por usuario prevalece
            sobre la de rol.{datosComisiones.generatedAt ? ` Generado ${fechaHora(datosComisiones.generatedAt)}.` : ''}
          </p>
        </>
      )}

      {totales && tipo !== 'comisiones' && (
        <>
          <StatGrid columnas={4}>
            <Stat compact
              className="border-fono/60"
              label="Total del período"
              valor={gs(totales.totalPyg)}
              sub={`${totales.orders} ventas · ${etiquetaRango(rango)}`}
            />
            <Stat compact label="Cobrado" valor={gs(totales.collectedPyg)} sub={totales.pendingPyg > 0 ? `Saldo ${gs(totales.pendingPyg)}` : 'Sin saldo pendiente'} />
            <Stat compact
              label="Margen real"
              valor={gs(totales.netProfitPyg ?? totales.profitPyg)}
              sub={totales.netMarginPct === null ? 'Sin costos cargados' : `Margen neto ${formatPercent(totales.netMarginPct)}%`}
            />
            <Stat compact label="Costo de mercadería" valor={gs(totales.costPyg)} sub={`${totales.units} unidades`} />
          </StatGrid>

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

          <StatGrid columnas={3}>
            <Stat compact label="Rotación del período" valor={datos.inventory?.sellThroughPct === null || datos.inventory?.sellThroughPct === undefined ? '—' : `${formatPercent(datos.inventory.sellThroughPct)}%`} sub={`${datos.inventory?.soldUnits ?? 0} unidades vendidas${datos.inventory?.daysOfStock === null || datos.inventory?.daysOfStock === undefined ? '' : ` · ${datos.inventory.daysOfStock} días de stock`}`} />
            <Stat compact label="Stock actual" valor={`${datos.inventory?.onHandUnits ?? 0} u.`} sub={`Valorizado ${gs(datos.inventory?.stockValuePyg ?? 0)}${datos.inventory?.stockWithoutCost ? ` · ${datos.inventory.stockWithoutCost} sin costo` : ''}`} />
            <Stat compact className="col-span-2 md:col-span-1" label="Faltantes" valor={`${datos.inventory?.shortages?.length ?? 0}`} sub={(datos.inventory?.shortages || []).slice(0, 2).map((p) => p.name).join(' · ') || 'Sin faltantes'} />
          </StatGrid>

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
            <ListaDensa
              lista={listaGrupos}
              testId="reportes-tabla"
              className="print:hidden"
              etiquetaTabla="Resultados del reporte"
              etiquetaPie="Páginas del reporte"
              unidad="filas"
              desde="xl"
              obtenerClave={(g) => g.key}
              columns={columnasTabla}
              renderCard={(g) => (
                <Card className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-[13px] font-semibold text-fore">{g.label}</div>
                    <StatusChip tono="neutral" etiqueta={`${g.units} u.`} />
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
          )}

          {grupos.length > 0 && (
            <TablaImpresion
              testId="reportes-impresion"
              titulo="Resultados del reporte (completo)"
              encabezados={columnas.map((c) => c.label)}
              filas={filasImpresion(columnas, grupos, gs)}
            />
          )}

          {grupo === 'product' && grupos.length > 0 && (
            <Card className="space-y-3 print:hidden">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Curva ABC y antigüedad</h3>
                <span className="text-xs text-mute">A: 80% acumulado · B: 95% · C: resto</span>
              </div>
              <ListaDensa
                lista={listaAbc}
                testId="reportes-abc-tabla"
                etiquetaTabla="Curva ABC y antigüedad"
                etiquetaPie="Páginas de la curva ABC"
                unidad="productos"
                obtenerClave={(fila) => fila.key}
                columns={[
                  { key: 'producto', header: 'Producto', ancho: 'minmax(0,1.6fr)', className: 'font-medium text-fore', cell: ({ g }) => g.label },
                  { key: 'venta', dinero: true, header: 'Venta', align: 'right', ancho: 'minmax(8.5rem,1fr)', cell: ({ g }) => <CeldaMoneda valor={g.grossPyg} tono="mute" className="w-full" /> },
                  { key: 'acumulado', header: '% acum.', align: 'right', ancho: '5rem', className: cn('text-xs text-mute', CELDA_NUMERO), cell: ({ pct }) => `${pct.toFixed(1)}%` },
                  { key: 'clase', header: 'Clase', ancho: '4rem', cell: ({ clase }) => <StatusChip tono={clase === 'A' ? 'ok' : clase === 'B' ? 'warn' : 'neutral'} etiqueta={clase} /> },
                  { key: 'disponibles', header: 'Disponibles', align: 'right', ancho: '6rem', className: cn('text-xs text-mute', CELDA_NUMERO), cell: ({ g }) => g.availableUnits ?? 0 },
                  { key: 'antiguedad', header: 'Antigüedad', align: 'right', ancho: '6rem', className: cn('text-xs text-mute', CELDA_NUMERO), cell: ({ dias }) => (dias === null ? '—' : `${dias} días`) },
                ]}
              />
            </Card>
          )}

          {/* ── Resultado por día: reutiliza el calendario y los cálculos de
              Ganancias (#181) con el mismo resultado que esa subpágina. ── */}
          <div className="grid grid-cols-1 gap-4 min-[1200px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <CalendarioGanancias
              datos={datosGanancia}
              serieApi={serieGanancia}
              titulo="Resultado por día"
              nota="Mismos números que Análisis → Ganancias"
            />
            {gananciaPeriodo && (
              <Card>
                <h3 className="font-bold mb-3">Cómo se calcula el resultado</h3>
                <div className="space-y-2 text-sm">
                  {lineasDeGanancia(gananciaPeriodo).map((linea) => <LineaValor key={linea.label} {...linea} />)}
                  <div className="border-t border-ink-600 pt-2 flex items-center justify-between font-extrabold">
                    <span>Resultado</span>
                    <span
                      data-testid="reporte-resultado"
                      className={gananciaPeriodo.estado === 'ganancia' ? 'text-ok' : gananciaPeriodo.estado === 'perdida' ? 'text-bad' : 'text-fore'}
                    >
                      {gs(gananciaPeriodo.ganancia)}
                    </span>
                  </div>
                </div>
                <p className="mt-3 text-xs text-mute">
                  Ingresos y costo salen de este reporte; gastos y publicidad de Finanzas, con el mismo cálculo que Análisis → Ganancias.
                </p>
              </Card>
            )}
          </div>

          <p className="text-xs text-mute">
            {porLinea
              ? 'Producto y categoría se calculan por línea: el descuento global y los cobros pertenecen a la orden y no se reparten. '
              : 'Día y vendedor se calculan por orden, con cobros y saldo reales. '}
            El margen real descuenta costos congelados y comisiones conocidas; no estima costos históricos ausentes.{datos.generatedAt ? ` Generado ${fechaHora(datos.generatedAt)}.` : ''}
          </p>
        </>
      )}
    </div>
  )
}

// Impresión: el listado en pantalla está paginado; al imprimir se dibuja el
// reporte completo (sin paginar) y se oculta el paginado.
function TablaImpresion({ testId, titulo, encabezados, filas }) {
  return (
    <table data-testid={testId} aria-label={titulo} className="hidden w-full text-xs print:table">
      <thead>
        <tr>{encabezados.map((h) => <th key={h} className="border-b border-black px-1 py-1 text-left">{h}</th>)}</tr>
      </thead>
      <tbody>
        {filas.map((fila, i) => (
          <tr key={i} data-fila-impresion>{fila.map((celda, j) => <td key={j} className="border-b border-gray-300 px-1 py-0.5">{celda}</td>)}</tr>
        ))}
      </tbody>
    </table>
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
