import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useNavigate, useSearchParams } from 'react-router-dom'
import { useUrlState } from '@/hooks/useUrlState'
import { isDemoRuntime } from '@/lib/demoMode'
import { listVentas, getVendedores, productosById, getProductos, listGastos } from '@/lib/storage'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { num, gs } from '@/utils/calculos'
import { armarResumenDia } from '@/utils/reporteResumen'
import ListaVentasDia from '@/components/ventas/ListaVentasDia'
import RangoFechas, {
  rangoDeParams,
  paramsDeRango,
  rangoAnterior,
  etiquetaRango,
} from '@/components/shared/RangoFechas'
import ReportePreview from '@/components/shared/ReportePreview'
import { buildResumenDiaHtml } from '@/components/shared/OrderReceipt'
import { ticketResumenDia } from '@/lib/printing/reportes'
import { imprimirDocumento } from '@/lib/printing/agent'
import MedioPago from '@/components/shared/MedioPago'
import Icon from '@/components/shared/Icon'
import { Card, Badge, Dot, EmptyState, Button } from '@/components/ui'
import { cn } from '@/lib/utils'

// Products at or below this stock count are flagged in the low-stock widget.
const UMBRAL_STOCK_BAJO = 3

// Quick actions shown next to the period selector. They reuse the same routes
// PanelVendedor uses from its sidebar (`/<vista>`).
const ACCIONES = [
  { label: 'Cargar venta', ruta: '/ventas', icon: 'plus' },
  { label: 'Nueva compra', ruta: '/compras', icon: 'box' },
  // Finanzas opens on the "Caja" subtab by default in PanelVendedor.
  { label: 'Abrir caja', ruta: '/finanzas/caja', icon: 'wallet' },
]

// Métrica al estilo del tablero: rótulo, número grande, indicador de tendencia
// y una línea de contexto abajo. Van en fila separadas por divisores.
function Metrica({ label, valor, delta, sub, tono = 'blue', accion }) {
  const sube = typeof delta === 'number' && delta >= 0
  const barra = { blue: 'bg-fono', green: 'bg-ok', red: 'bg-bad' }[tono]
  return (
    <div className="border-b border-ink-600 p-5 last:border-b-0 lg:border-b-0">
      <div className="text-sm text-mute">{label}</div>
      <div className="mt-1.5 flex items-center gap-2.5">
        <span className="text-2xl font-semibold tracking-tight">{valor}</span>
        {typeof delta === 'number' ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium',
              sube ? 'bg-ok/15 text-ok' : 'bg-bad/15 text-bad',
            )}
          >
            {sube ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}%
          </span>
        ) : (
          <span className={cn('h-0.5 w-4 rounded-full', barra)} />
        )}
      </div>
      {sub && <div className="mt-1.5 text-xs text-mute">{sub}</div>}
      {accion && (
        <Button
          type="button"
          variant="ghost"
          className="mt-2 h-auto px-2 py-1 text-xs font-medium"
          onClick={accion.onClick}
        >
          {accion.label}
          <Icon name="chevron" className="h-3 w-3 rotate-180" />
        </Button>
      )}
    </div>
  )
}

const variacion = (hoy, antes) => (antes > 0 ? ((hoy - antes) / antes) * 100 : null)

export default function Resumen() {
  const { empresa } = useSesion()
  const [resumenOpen, setResumenOpen] = useState(false)
  const [pendientesHoy, setPendientesHoy] = useState(null)
  useEffect(() => {
    if (isDemoRuntime) return
    const limite = Date.now() + 24 * 3600 * 1000
    Promise.allSettled([
      api.get('/api/inventory-reservations').then((filas) => (Array.isArray(filas) ? filas.filter((fila) => new Date(fila.reservedUntil).getTime() <= limite).length : 0)),
      api.get('/api/warranties').then((filas) => (Array.isArray(filas) ? filas.filter((fila) => fila.status !== 'DELIVERED' && fila.expiresAt && new Date(fila.expiresAt).getTime() <= Date.now()).length : 0)),
      api.get('/api/payments?overdue=true').then((filas) => (Array.isArray(filas) ? filas.length : 0)),
    ]).then((resultados) => {
      setPendientesHoy({ reservas: resultados[0].status === 'fulfilled' ? resultados[0].value : 0, garantias: resultados[1].status === 'fulfilled' ? resultados[1].value : 0, cuotas: resultados[2].status === 'fulfilled' ? resultados[2].value : 0 })
    })
  }, [])
  const navigate = useNavigate()
  const ventas = listVentas()
  const vendedores = getVendedores()
  const gastos = listGastos()
  const prods = productosById()
  const catalogo = getProductos()
  // El rango y el filtro viven en la URL: recargar y compartir conserva el período.
  const [searchParams, setSearchParams] = useSearchParams()
  const [rango, setRango] = useState(() => rangoDeParams(searchParams))
  const cambiarRango = useCallback(
    next => {
      setRango(next)
      setSearchParams(actuales => paramsDeRango(next, actuales), { replace: true })
    },
    [setSearchParams],
  )
  const [filtroLista, setFiltroLista] = useUrlState('filtro', 'todas')
  const [creditos, setCreditos] = useState(null)
  const listaRef = useRef(null)

  // Aviso de cobranzas del inicio: vencido y por vencer en los próximos 7 días.
  useEffect(() => {
    let vigente = true
    api.get('/api/credits').then(data => { if (vigente) setCreditos(data?.totals || null) }).catch(() => { if (vigente) setCreditos(null) })
    return () => { vigente = false }
  }, [])

  const vendedoresById = useMemo(
    () => Object.fromEntries(vendedores.map(v => [v.id, v.nombre])),
    [vendedores],
  )

  // Mismos números en pantalla y en el papel: el cálculo vive en
  // `armarResumenDia` y el cierre imprimible lo reusa tal cual.
  const d = useMemo(
    () => armarResumenDia({ ventas, gastos, prods, vendedoresById, rango, prev: rangoAnterior(rango) }),
    [ventas, gastos, prods, rango, vendedoresById],
  )

  const maxSerie = Math.max(...d.serie.map(([, v]) => v), 1)
  const maxVend = Math.max(...d.ranking.map(r => r.total), 1)

  // Low-stock products, worst first. Computed per render (no memo) so that
  // in-place stock mutations coming from API-mode sales are picked up at once.
  const stockBajo = catalogo
    .filter(p => num(p.stock) <= UMBRAL_STOCK_BAJO)
    .sort((a, b) => num(a.stock) - num(b.stock))
    .slice(0, 8)

  const pctCobrado = d.total > 0 ? (d.cobrado / d.total) * 100 : 0
  const pctPendiente = Math.max(0, 100 - pctCobrado)

  // Applies the "Pendientes" filter on the sales list and brings it into view.
  function irAPendientes() {
    setFiltroLista('pendientes')
    setTimeout(() => listaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  const pendientes = pendientesHoy && (pendientesHoy.reservas > 0 || pendientesHoy.garantias > 0 || pendientesHoy.cuotas > 0)
  return (
    <div className="space-y-5">
      {pendientes && (
        <Card className="border-warn/30 bg-warn/5">
          <h2 className="font-semibold text-warn">Pendientes de hoy</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {pendientesHoy.reservas > 0 && <div className="rounded-xl border border-ink-600 p-3"><p className="text-xl font-bold tabular-nums text-warn">{pendientesHoy.reservas}</p><p className="text-xs text-mute">Reservas por vencer (próximas 24 h)</p></div>}
            {pendientesHoy.garantias > 0 && <div className="rounded-xl border border-ink-600 p-3"><p className="text-xl font-bold tabular-nums text-bad">{pendientesHoy.garantias}</p><p className="text-xs text-mute">Garantías vencidas sin entregar</p></div>}
            {pendientesHoy.cuotas > 0 && <div className="rounded-xl border border-ink-600 p-3"><p className="text-xl font-bold tabular-nums text-bad">{pendientesHoy.cuotas}</p><p className="text-xs text-mute">Cuotas vencidas por cobrar</p></div>}
          </div>
        </Card>
      )}
      {/* ── Encabezado + período ─────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-mute">
            Acá ves el movimiento de la tienda en el período elegido.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ACCIONES.map(a => (
            <Button
              key={a.label}
              variant="outline"
              className="h-9 px-3 text-xs font-medium"
              onClick={() => navigate(a.ruta)}
            >
              <Icon name={a.icon} className="h-4 w-4" />
              {a.label}
            </Button>
          ))}
          <Button
            variant="outline"
            className="h-9 px-3 text-xs font-medium"
            onClick={irAPendientes}
          >
            <Icon name="receipt" className="h-4 w-4" />
            Cobrar pendientes
          </Button>
          <Button
            variant="outline"
            className="h-9 px-3 text-xs font-medium"
            onClick={() => setResumenOpen(true)}
          >
            <Icon name="printer" className="h-4 w-4" />
            Imprimir resumen
          </Button>
          <RangoFechas valor={rango} onChange={cambiarRango} />
        </div>
      </div>

      {/* ── Métricas (fila con divisores) ────────────────────────── */}
      <div className="grid grid-cols-2 divide-ink-600 rounded-xl border border-ink-600 bg-ink-800 lg:grid-cols-4 lg:divide-x">
        <Metrica
          label="Facturado"
          valor={gs(d.total)}
          delta={variacion(d.total, d.totalAnt)}
          sub={`Período anterior ${gs(d.totalAnt)}`}
        />
        <Metrica
          label="Ventas"
          valor={d.act.length}
          tono="blue"
          sub={`${d.pagadas} pagadas · ${d.sinPagar} pendientes`}
          accion={{ label: 'Ver pedidos', onClick: () => navigate('/pedidos') }}
        />
        <Metrica
          label="Ticket promedio"
          valor={gs(d.ticket)}
          delta={variacion(d.ticket, d.ticketAnt)}
          sub={`Por venta en ${etiquetaRango(rango).toLowerCase()}`}
        />
        <Metrica
          label="Comisiones"
          valor={gs(d.comision)}
          tono="green"
          sub={`Delivery ${gs(d.delivery)} · Gastos ${gs(d.gastos)}`}
        />
      </div>

      {/* ── Costos pendientes ────────────────────────────────────── */}
      {d.sinCosto.lineas > 0 && (
        <Card className="border-warn/30 bg-warn/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-warn">
                  Costo pendiente: {d.sinCosto.lineas} {d.sinCosto.lineas === 1 ? 'línea' : 'líneas'} por {gs(d.sinCosto.monto)}
                </p>
                <p className="mt-1 text-xs text-mute">
                  Mientras haya ventas sin costo cargado, el margen real y las comisiones pueden quedar incompletos. Cargá el costo del producto o de la línea.
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate('/analisis/reportes')}>Ver análisis</Button>
          </div>
        </Card>
      )}

      {creditos && (creditos.overduePyg > 0 || creditos.dueSoonPyg > 0) && (
        <Card className="border-warn/30 bg-warn/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-warn">
                  Créditos por cobrar: {gs(creditos.outstandingPyg)}
                  {creditos.overduePyg > 0 ? ` · ${gs(creditos.overduePyg)} vencido` : ''}
                </p>
                <p className="mt-1 text-xs text-mute">
                  {creditos.overdueCustomers > 0
                    ? `${creditos.overdueCustomers} ${creditos.overdueCustomers === 1 ? 'cliente con saldo vencido' : 'clientes con saldo vencido'}`
                    : 'Sin saldos vencidos'}
                  {creditos.dueSoonPyg > 0 ? ` · ${gs(creditos.dueSoonPyg)} vence en los próximos 7 días (${creditos.dueSoonCustomers} ${creditos.dueSoonCustomers === 1 ? 'cliente' : 'clientes'})` : ''}.
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate('/finanzas')}>Ver créditos</Button>
          </div>
        </Card>
      )}

      {/* ── Cobrado vs pendiente ─────────────────────────────────── */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Cobrado vs pendiente</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge color="green">{d.pagadas} pagadas</Badge>
            <Badge color="red">{d.sinPagar} pendientes</Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-10 gap-y-3">
          <div className="flex items-center gap-2.5">
            <Dot color="green" />
            <div>
              <div className="text-xs text-mute">Cobrado</div>
              <div className="text-xl font-semibold tracking-tight text-ok tabular-nums">
                {gs(d.cobrado)}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={irAPendientes}
            disabled={d.sinPagar === 0}
            title={d.sinPagar === 0 ? 'No hay ventas pendientes' : 'Ver pendientes en el detalle'}
            className="group flex items-center gap-2.5 rounded-lg text-left transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Dot color="red" />
            <div>
              <div className="flex items-center gap-1 text-xs text-mute">
                Pendiente
                <Icon
                  name="chevron"
                  className="h-3 w-3 rotate-180 transition group-hover:translate-x-0.5"
                />
              </div>
              <div className="text-xl font-semibold tracking-tight text-bad tabular-nums">
                {gs(d.pendiente)}
              </div>
            </div>
          </button>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink-600">
          <div className="flex h-full">
            <div className="bg-ok" style={{ width: `${pctCobrado}%` }} />
            <div className="bg-bad" style={{ width: `${pctPendiente}%` }} />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 min-[1200px]:grid-cols-3">
        {/* ── Evolución diaria ───────────────────────────────────── */}
        <Card className="min-[1200px]:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium">Evolución</h2>
            <Badge color="blue">{d.serie.length} días con ventas</Badge>
          </div>
          {d.serie.length === 0 ? (
            <EmptyState compact icon="box" title="Sin ventas en este período" />
          ) : (
            <div className="flex h-44 items-end gap-1.5">
              {d.serie.map(([f, v]) => (
                <div
                  key={f}
                  className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1.5"
                >
                  <div className="pointer-events-none absolute -top-8 z-10 hidden whitespace-nowrap rounded-md border border-ink-500 bg-paper px-2 py-1 text-xs group-hover:block">
                    {gs(v)}
                  </div>
                  <div
                    className="w-full rounded-t bg-blue-line opacity-80 transition group-hover:opacity-100"
                    style={{ height: `${Math.max((v / maxSerie) * 100, 3)}%` }}
                  />
                  <span className="text-[10px] text-mute">{f.slice(8)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── Medios de pago ─────────────────────────────────────── */}
        <Card>
          <h2 className="mb-4 font-medium">Medios de pago</h2>
          {d.medios.length === 0 ? (
            <EmptyState compact icon="box" title="Sin datos" />
          ) : (
            <div className="space-y-3">
              {d.medios.map(m => (
                <div key={m.medio}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <MedioPago medio={m.medio} alto="h-4" />
                    <span className="text-sm font-medium">{gs(m.monto)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-ink-600">
                    <div
                      className="h-full rounded-full bg-blue-line"
                      style={{ width: `${m.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Stock bajo ───────────────────────────────────────────── */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Stock bajo</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge color="orange">≤ {UMBRAL_STOCK_BAJO} unidades</Badge>
            <Button
              type="button"
              variant="ghost"
              className="h-auto px-2 py-1 text-xs font-medium"
              onClick={() => navigate('/inventario/unidades')}
              title="Ver las alertas de stock en Inventario"
            >
              Ver alertas
              <Icon name="chevron" className="h-3 w-3 rotate-180" />
            </Button>
          </div>
        </div>
        {stockBajo.length === 0 ? (
          <div className="py-8 text-center text-sm text-mute">
            Todos los productos tienen stock suficiente
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {stockBajo.map(p => {
              const stock = num(p.stock)
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2.5 rounded-lg border border-ink-600 bg-ink-700/40 px-3 py-2.5"
                >
                  <Dot color={stock <= 0 ? 'red' : 'orange'} />
                  <span className="min-w-0 flex-1 truncate text-sm">{p.nombre}</span>
                  <Badge color={stock <= 0 ? 'red' : 'orange'} className="shrink-0">
                    {stock <= 0 ? 'Sin stock' : `${stock} u.`}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => navigate('/inventario/unidades')}
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-ink-500 px-2 py-1 text-xs text-mute transition hover:border-fono hover:text-white"
                  >
                    Ver inventario
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* ── Vendedores ───────────────────────────────────────────── */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-medium">Rendimiento por vendedor</h2>
          <span className="text-xs text-mute">{etiquetaRango(rango)}</span>
        </div>
        {d.ranking.length === 0 ? (
          <EmptyState compact icon="box" title="Sin ventas en este período" />
        ) : (
          <div className="space-y-1">
            {d.ranking.map((v, i) => (
              <div
                key={v.id}
                className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-ink-700"
              >
                <span className="w-5 text-center text-xs font-medium text-mute">{i + 1}</span>
                <Dot color={i === 0 ? 'green' : v.total > 0 ? 'blue' : 'slate'} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium sm:w-32 sm:flex-none">
                  {v.nombre}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-600">
                  <div
                    className={cn('h-full rounded-full', i === 0 ? 'bg-ok' : 'bg-blue-line')}
                    style={{ width: `${(v.total / maxVend) * 100}%` }}
                  />
                </div>
                <span className="w-10 text-right text-xs text-mute">{v.n}</span>
                <span className="w-24 text-right text-sm font-semibold sm:w-28">{gs(v.total)}</span>
                <span className="hidden w-28 text-right text-sm text-ok sm:block">{gs(v.com)}</span>
              </div>
            ))}
            <div className="mt-2 flex items-center gap-3 border-t border-ink-600 px-2 pt-3 text-xs text-mute">
              <span className="w-5" />
              <span className="w-2" />
              <span className="min-w-0 flex-1 truncate sm:w-32 sm:flex-none">Total</span>
              <span className="flex-1" />
              <span className="w-10 text-right">{d.act.length}</span>
              <span className="w-24 text-right font-semibold text-fore sm:w-28">{gs(d.total)}</span>
              <span className="hidden w-28 text-right text-ok sm:block">{gs(d.comision)}</span>
            </div>
          </div>
        )}
      </Card>

      {/* ── Detalle de ventas ────────────────────────────────────── */}
      <div ref={listaRef} className="scroll-mt-24">
        <ListaVentasDia
          rango={rango}
          mostrarVendedor
          vendedoresById={vendedoresById}
          titulo="Detalle de ventas"
          filtro={filtroLista}
          onFiltroChange={setFiltroLista}
        />
      </div>
      <ReportePreview
        open={resumenOpen}
        onClose={() => setResumenOpen(false)}
        titulo="Resumen del día"
        construir={(format) => buildResumenDiaHtml({ ...d, rango, etiqueta: etiquetaRango(rango), empresa: empresa?.nombre || '' }, { format })}
        directo={({ ancho }) => imprimirDocumento(ticketResumenDia({ ...d, rango, etiqueta: etiquetaRango(rango), empresa: empresa?.nombre || '' }, { ancho }), { tipo: 'resumen-dia' })}
      />
    </div>
  )
}
