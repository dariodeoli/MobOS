import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { isDemoRuntime } from '@/lib/demoMode'
import { gs } from '@/utils/calculos'
import { Badge, Button, Card, Select, Stat } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import RangoFechas, { PRESETS, etiquetaRango } from '@/components/shared/RangoFechas'
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
  const [rango, setRango] = useState(rangoInicial)
  const [grupo, setGrupo] = useState('product')
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

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
      const respuesta = await api.get(
        `/api/reports?from=${desde}&to=${hasta}&groupBy=${grupo}&tzOffset=${TZ_OFFSET}`,
      )
      if (pedidoRef.current !== id) return
      setDatos(respuesta)
    } catch (e) {
      if (pedidoRef.current !== id) return
      setDatos(null)
      setError(e?.message || 'No se pudo generar el reporte.')
    } finally {
      if (pedidoRef.current === id) setCargando(false)
    }
  }, [rango, grupo])

  useEffect(() => {
    cargar()
  }, [cargar])

  const totales = datos?.totals || null
  const grupos = datos?.groups || []
  const columnas = columnasReporte(grupo)
  const porLinea = esGrupoPorLinea(grupo)

  function exportar() {
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
            <div className="font-semibold text-white">Reportes sobre datos reales</div>
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
          <RangoFechas valor={rango} onChange={setRango} />
          <Select value={grupo} onChange={(e) => setGrupo(e.target.value)} className="h-9 w-auto">
            {GRUPOS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.plural}
              </option>
            ))}
          </Select>
          <Button variant="outline" onClick={cargar} disabled={cargando}>
            <Icon name="refresh" className={cargando ? 'animate-spin' : ''} />
            {cargando ? 'Cargando…' : 'Actualizar'}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={exportar} disabled={!datos || !grupos.length}>
            <Icon name="download" />
            Exportar CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()} disabled={!datos || !grupos.length}>
            <Icon name="report" />
            Imprimir
          </Button>
        </div>
      </Card>

      {error && (
        <Card className="border-bad/40 bg-bad/10">
          <div className="flex items-start gap-3">
            <Icon name="alert" className="mt-0.5 h-5 w-5 text-bad" />
            <div className="flex-1">
              <div className="font-semibold text-white">No se pudo cargar el reporte</div>
              <p className="mt-1 text-sm text-mute">{error}</p>
            </div>
            <Button variant="outline" onClick={cargar}>Reintentar</Button>
          </div>
        </Card>
      )}

      {totales && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              destacado
              label="Total del período"
              valor={gs(totales.totalPyg)}
              sub={`${totales.orders} ventas · ${etiquetaRango(rango)}`}
            />
            <Stat label="Cobrado" valor={gs(totales.collectedPyg)} sub={totales.pendingPyg > 0 ? `Saldo ${gs(totales.pendingPyg)}` : 'Sin saldo pendiente'} />
            <Stat
              label="Ganancia bruta"
              valor={gs(totales.profitPyg)}
              sub={totales.marginPct === null ? 'Sin costos cargados' : `Margen ${totales.marginPct}%`}
            />
            <Stat label="Costo de mercadería" valor={gs(totales.costPyg)} sub={`${totales.units} unidades`} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {totales.discountPyg > 0 && <Badge color="orange">Descuentos {gs(totales.discountPyg)}</Badge>}
            {totales.deliveryPyg > 0 && <Badge color="blue">Delivery {gs(totales.deliveryPyg)}</Badge>}
            {totales.linesWithoutCost > 0 && (
              <Badge color="slate">
                {totales.linesWithoutCost} línea{totales.linesWithoutCost === 1 ? '' : 's'} sin costo ({gs(totales.salesWithoutCostPyg)}) — no suman a la ganancia
              </Badge>
            )}
            {datos.truncated && <Badge color="red">El período supera el tope de ventas analizadas</Badge>}
          </div>

          {grupos.length === 0 ? (
            <Card className="py-10 text-center">
              <Icon name="report" className="mx-auto h-6 w-6 text-mute" />
              <div className="mt-3 font-semibold text-white">Sin ventas en el período</div>
              <p className="mt-1 text-sm text-mute">
                Probá con otro rango de fechas o revisá que las ventas estén confirmadas en el POS.
              </p>
            </Card>
          ) : (
            <>
              {/* Tabla en pantallas grandes */}
              <Card className="hidden overflow-x-auto p-0 md:block">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-ink-600 text-left text-[11px] uppercase tracking-wider text-mute">
                      {columnas.map((c) => (
                        <th key={c.key} className={c.tipo === 'texto' ? 'px-4 py-3' : 'px-4 py-3 text-right'}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grupos.map((g) => (
                      <tr key={g.key} className="border-b border-ink-700/60 last:border-0">
                        {columnas.map((c) => (
                          <td
                            key={c.key}
                            className={
                              c.tipo === 'texto'
                                ? 'px-4 py-3 font-medium text-white'
                                : 'px-4 py-3 text-right tabular-nums text-mute'
                            }
                          >
                            {c.tipo === 'monto' ? gs(g[c.key]) : g[c.key]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              {/* Tarjetas en móvil */}
              <div className="space-y-3 md:hidden">
                {grupos.map((g) => (
                  <Card key={g.key}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-semibold text-white">{g.label}</div>
                      <Badge color="slate">{g.units} u.</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <Linea label={porLinea ? 'Venta' : 'Total'} valor={gs(porLinea ? g.grossPyg : g.totalPyg)} />
                      <Linea label="Costo" valor={gs(g.costPyg)} />
                      <Linea label="Ganancia" valor={gs(g.profitPyg)} />
                      <Linea label="Sin costo" valor={gs(g.salesWithoutCostPyg)} />
                      {!porLinea && <Linea label="Cobrado" valor={gs(g.collectedPyg)} />}
                      {!porLinea && <Linea label="Saldo" valor={gs(g.pendingPyg)} />}
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}

          <p className="text-xs text-mute">
            {porLinea
              ? 'Producto y categoría se calculan por línea: el descuento global y los cobros pertenecen a la orden y no se reparten. '
              : 'Día y vendedor se calculan por orden, con cobros y saldo reales. '}
            La ganancia solo usa líneas con costo conocido y no recalcula movimientos históricos. Generado{' '}
            {datos.generatedAt ? new Date(datos.generatedAt).toLocaleString('es-PY') : ''}.
          </p>
        </>
      )}
    </div>
  )
}

function Linea({ label, valor }) {
  return (
    <div className="rounded-lg bg-ink-700/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-mute">{label}</div>
      <div className="font-semibold tabular-nums text-white">{valor}</div>
    </div>
  )
}
