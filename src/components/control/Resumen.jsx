import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useNavigate, useSearchParams } from 'react-router-dom'
import { useUrlState } from '@/hooks/useUrlState'
import { isDemoRuntime } from '@/lib/demoMode'
import { listVentas, getVendedores, productosById, getProductos, listGastos } from '@/lib/storage'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { metricasEjecutivas } from '@/lib/metricas'
import { num, gs, variacion } from '@/utils/calculos'
import { armarResumenDia } from '@/utils/reporteResumen'
import ListaVentasDia from '@/components/ventas/ListaVentasDia'
import RangoFechas, {
  PRESETS,
  rangoDeParams,
  paramsDeRango,
  rangoAnterior,
  rangoPorDefecto,
  etiquetaRango,
} from '@/components/shared/RangoFechas'
import { useUltimoUsado } from '@/hooks/useUltimoUsado'
import { CLAVES_FIN, rangoDePreset } from '@/lib/finUltimoUsado'
import ReportePreview from '@/components/shared/ReportePreview'
import { buildResumenDiaHtml } from '@/components/shared/OrderReceipt'
import { buildResumenEjecutivoHtml } from '@/components/shared/reporteEjecutivo'
import { ticketResumenDia } from '@/lib/printing/reportes'
import { imprimirDocumento } from '@/lib/printing/agent'
import MedioPago from '@/components/shared/MedioPago'
import Icon from '@/components/shared/Icon'
import { Card, Badge, Dot, EmptyState, Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { CELDA_DATO, CELDA_IDENTIDAD_GRANDE, ROTULO_DATO } from '@/components/shared/tabla'
// Products at or below this stock count are flagged in the low-stock widget.
const UMBRAL_STOCK_BAJO = 3

// Quick actions shown next to the period selector. They reuse the same routes
// PanelVendedor uses from its sidebar (`/<vista>`).
const ACCIONES = [
  { label: 'Cargar venta', ruta: '/ventas', icon: 'plus' },
  { label: 'Nueva compra', ruta: '/compras', icon: 'store' },
  // Finanzas opens on the "Caja" subtab by default in PanelVendedor.
  { label: 'Abrir caja', ruta: '/finanzas/caja', icon: 'wallet' },
  { label: 'Ver pedidos', ruta: '/pedidos', icon: 'box' },
]

// Pendientes de hoy: lo accionable del día, en una franja compacta arriba de
// todo. Con todo al día se muestra el estado en verde en lugar de esconderse.
const PENDIENTES_HOY = [
  { clave: 'reservas', texto: 'Reservas por vencer (24 h)', ruta: '/inventario/reservas', tono: 'warn' },
  { clave: 'garantias', texto: 'Garantías vencidas sin entregar', ruta: '/garantias', tono: 'bad' },
  { clave: 'cuotas', texto: 'Cuotas vencidas por cobrar', ruta: '/finanzas/cuotas', tono: 'bad' },
]

function PendientesDeHoy({ pendientes, onIr }) {
  // Mientras carga no ocupa lugar; si no hay nada, se muestra el estado al día.
  if (!pendientes) return null
  const items = PENDIENTES_HOY.filter((item) => Number(pendientes[item.clave]) > 0)
  if (!items.length) {
    return (
      <Card className="flex items-center gap-2.5 border-ok/25 bg-ok/5">
        <Icon name="check" className="h-4 w-4 shrink-0 text-ok" />
        <p className="text-sm text-mute">
          <strong className="font-semibold text-ok">Al día.</strong> No hay pendientes para hoy.
        </p>
      </Card>
    )
  }
  return (
    <Card className="border-warn/30 bg-warn/5 p-4">
      <div className="flex items-center gap-2">
        <Icon name="alert" className="h-4 w-4 shrink-0 text-warn" />
        <h2 className="text-sm font-semibold text-warn">Pendientes de hoy</h2>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item.clave}
            type="button"
            onClick={() => onIr(item.ruta)}
            className="group flex min-w-0 items-center gap-2.5 rounded-xl border border-ink-600 bg-ink-800/70 px-3.5 py-2.5 text-left transition hover:border-fono/50"
          >
            <span
              className={cn(
                'text-xl font-bold tabular-nums',
                item.tono === 'bad' ? 'text-bad' : 'text-warn',
              )}
            >
              {pendientes[item.clave]}
            </span>
            <span className={cn('min-w-0 flex-1', CELDA_DATO)}>{item.texto}</span>
            <Icon
              name="chevron"
              className="h-3.5 w-3.5 shrink-0 rotate-180 text-mute transition group-hover:text-fore"
            />
          </button>
        ))}
      </div>
    </Card>
  )
}

// Facturado del período: la métrica principal, con la estética del total de
// venta de /pos/cargar. Adentro vive el cobrado vs pendiente (mismos datos y
// misma acción que la tarjeta anterior).
function CardFacturado({ total, totalAnt, cobrado, pendiente, pagadas, sinPagar, pctCobrado, etiqueta, onPendientes }) {
  const delta = variacion(total, totalAnt)
  const sube = typeof delta === 'number' && delta >= 0
  return (
    <div className="overflow-hidden rounded-[14px] border border-fono/40 bg-gradient-to-br from-fono-dark via-fono to-fono p-[18px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[.08em] text-onbrand/75">
          Facturado
        </span>
        <span className="flex items-center gap-2">
          {typeof delta === 'number' && (
            <span className="rounded-full bg-onbrand/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-onbrand">
              {sube ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          <Icon name="chart" className="h-4 w-4 text-onbrand/80" />
        </span>
      </div>
      <div className="mt-1.5 text-[30px] font-semibold leading-none tracking-tight tabular-nums text-onbrand">
        {gs(total)}
      </div>
      <div className="mt-2 text-[11.5px] text-onbrand/75">
        {etiqueta} · período anterior {gs(totalAnt)}
      </div>

      <div className="mt-4 rounded-xl bg-onbrand/10 p-3.5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-onbrand/70">Cobrado</div>
            <div className="text-xl font-semibold tabular-nums text-onbrand">{gs(cobrado)}</div>
            <div className="text-[11px] text-onbrand/70">
              {pagadas} {pagadas === 1 ? 'pagada' : 'pagadas'}
            </div>
          </div>
          <button
            type="button"
            onClick={onPendientes}
            disabled={sinPagar === 0}
            title={sinPagar === 0 ? 'No hay ventas pendientes' : 'Ver los pendientes en el detalle'}
            className="rounded-lg text-right transition disabled:cursor-default disabled:opacity-70"
          >
            <div className="flex items-center justify-end gap-1 text-[11px] font-medium uppercase tracking-wider text-onbrand/70">
              Pendiente
              <Icon name="chevron" className="h-3 w-3 rotate-180" />
            </div>
            <div className="text-xl font-semibold tabular-nums text-onbrand">{gs(pendiente)}</div>
            <div className="text-[11px] text-onbrand/70">
              {sinPagar} {sinPagar === 1 ? 'pendiente' : 'pendientes'}
            </div>
          </button>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-onbrand/20">
          <div className="h-full rounded-full bg-onbrand" style={{ width: `${pctCobrado}%` }} />
        </div>
      </div>
    </div>
  )
}

// Accesos rápidos del resumen: las acciones que el dueño usa a diario.
function AccesosRapidos({ onIr, onImprimir }) {
  return (
    <Card className="flex h-full flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold">Accesos rápidos</h2>
      <div className="grid flex-1 grid-cols-2 gap-2 lg:grid-cols-1">
        {ACCIONES.map((accion) => (
          <button
            key={accion.label}
            type="button"
            onClick={() => onIr(accion.ruta)}
            className="flex min-w-0 items-center gap-2.5 rounded-xl border border-ink-600 bg-ink-800/60 px-3 py-2.5 text-left text-sm font-medium text-fore transition hover:border-fono/50"
          >
            <Icon name={accion.icon} className="h-4 w-4 shrink-0 text-fono-light" />
            <span className="min-w-0 flex-1 truncate">{accion.label}</span>
          </button>
        ))}
      </div>
      <Button variant="outline" className="h-9 px-3 text-xs font-medium" onClick={onImprimir}>
        <Icon name="printer" className="h-4 w-4" />
        Imprimir resumen
      </Button>
    </Card>
  )
}

// Métrica secundaria: mismo lenguaje que las tarjetas, un escalón abajo del
// facturado (que vive en el hero).
function Metrica({ label, valor, delta, sub, tono = 'blue' }) {
  const sube = typeof delta === 'number' && delta >= 0
  const barra = { blue: 'bg-fono', green: 'bg-ok', red: 'bg-bad' }[tono]
  return (
    <Card className="p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-mute">{label}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{valor}</span>
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
    </Card>
  )
}

const TONO_ABC = { A: 'green', B: 'orange', C: 'slate' }

// Top productos con la curva ABC que manda el servidor (#171): la portada y
// el Análisis comparten la misma clasificación.
function CardTopProductos({ top, curva }) {
  const total = curva.A.monto + curva.B.monto + curva.C.monto
  const concentracionA = total > 0 ? Math.round((curva.A.monto / total) * 100) : 0
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">Top productos</h2>
        <span className="text-xs text-mute">Curva ABC por venta</span>
      </div>
      {top.length === 0 ? (
        <EmptyState compact icon="box" title="Sin ventas en este período" />
      ) : (
        <>
          <div className="space-y-1.5">
            {top.slice(0, 6).map((producto, indice) => (
              <div key={producto.id} className="flex items-center gap-2.5">
                <span className="w-4 text-right text-xs text-mute">{indice + 1}</span>
                <Badge color={TONO_ABC[producto.clase]} className="w-fit shrink-0 px-1.5 py-0 text-[10px]">{producto.clase}</Badge>
                <span className="min-w-0 flex-1 truncate text-sm">{producto.nombre}</span>
                <span className="w-12 shrink-0 text-right text-xs text-mute">{producto.cantidad} u.</span>
                <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums sm:w-28">{gs(producto.monto)}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ink-600 pt-2 text-[11px] text-mute">
            {['A', 'B', 'C'].map((clase) => (
              <span key={clase} className="inline-flex items-center gap-1.5">
                <Badge color={TONO_ABC[clase]} className="px-1.5 py-0 text-[10px]">{clase}</Badge>
                {curva[clase].productos} prod. · {gs(curva[clase].monto)}
              </span>
            ))}
            <span className="text-mute">A concentra {concentracionA}% de la venta</span>
          </div>
        </>
      )}
    </Card>
  )
}

// Stock valorizado y rotación del servidor (#171): valor a costo (sin inventar
// costos ausentes), días de stock según la venta diaria del período y faltantes.
function CardStock({ inventario }) {
  const celdas = [
    ['Valor a costo', gs(inventario.valorPyg)],
    ['Unidades', `${inventario.unidades} u.`],
    ['Días de stock', inventario.diasDeStock === null ? '—' : `${inventario.diasDeStock} días`],
    ['Rotación', inventario.rotacionPct === null ? '—' : `${inventario.rotacionPct}%`],
    ['Faltantes', `${inventario.faltantes.length}`],
    ['Sin costo', `${inventario.sinCosto}`],
  ]
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">Stock valorizado</h2>
        <span className="text-xs text-mute">Valor a costo · rotación del período</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {celdas.map(([label, valor]) => (
          <div key={label} className="rounded-lg border border-ink-600 bg-ink-800/40 px-3 py-2">
            <div className={ROTULO_DATO}>{label}</div>
            <div className={cn('mt-0.5 tabular-nums', CELDA_IDENTIDAD_GRANDE)}>{valor}</div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-mute">
        Días de stock = unidades disponibles ÷ venta diaria del período. Los productos sin costo cargado no suman al valor.
      </p>
    </Card>
  )
}

// Cobros por procesadora o por cuenta: pagos cobrados en el período, no ventas.
function CardPagos({ titulo, detalle, filas, vacio }) {
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">{titulo}</h2>
        <span className="text-xs text-mute">{detalle}</span>
      </div>
      {filas.length === 0 ? (
        <EmptyState compact icon="wallet" title={vacio} />
      ) : (
        <div className="space-y-1.5">
          {filas.slice(0, 5).map((fila) => (
            <div key={fila.key} className="flex items-center gap-2.5">
              <span className="min-w-0 flex-1 truncate text-sm">{fila.label}</span>
              <span className="shrink-0 text-xs text-mute">{fila.operaciones} pago(s)</span>
              <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums sm:w-28">{gs(fila.monto)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// Conciliación del período en la portada: lo conciliado, lo que falta y las
// diferencias de los lotes, con acceso al detalle en Finanzas (#144/#171).
function CardConciliacion({ conciliacion, onIr }) {
  const conAlerta = conciliacion.diferenciaPyg !== 0 || conciliacion.porConciliarPyg > 0
  return (
    <Card className={cn('space-y-3', conAlerta && 'border-warn/30')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">Conciliación</h2>
        <button
          type="button"
          onClick={() => onIr('/finanzas/conciliacion')}
          className="flex items-center gap-1 text-xs font-medium text-fono-light transition hover:text-white"
        >
          Ver detalle
          <Icon name="chevron" className="h-3 w-3 rotate-180" />
        </button>
      </div>
      <div className="space-y-1.5 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-mute">Conciliado</span>
          <span className="font-semibold tabular-nums text-ok">{gs(conciliacion.conciliadoPyg)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-mute">Por conciliar</span>
          <span className={cn('font-semibold tabular-nums', conciliacion.porConciliarPyg > 0 ? 'text-warn' : 'text-mute')}>{gs(conciliacion.porConciliarPyg)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-ink-600 pt-1.5">
          <span className="text-mute">Diferencia de lotes</span>
          <span className={cn('font-semibold tabular-nums', conciliacion.diferenciaPyg !== 0 ? 'text-bad' : 'text-mute')}>{conciliacion.diferenciaPyg ? gs(conciliacion.diferenciaPyg) : '—'}</span>
        </div>
      </div>
      <p className="text-[11px] text-mute">
        {conciliacion.lotes} lote(s) · {conciliacion.operaciones} operación(es) del período.
      </p>
    </Card>
  )
}

export default function Resumen() {
  const { empresa, sucursal } = useSesion()
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
  // #209: el período arranca con el último preset usado en Finanzas/Análisis.
  const [presetRecordado, recordarPreset] = useUltimoUsado(CLAVES_FIN.rango, 'hoy')
  const [rango, setRango] = useState(() => rangoDeParams(searchParams, () => rangoDePreset(PRESETS, presetRecordado, rangoPorDefecto)))
  const cambiarRango = useCallback(
    next => {
      setRango(next)
      if (next?.preset) recordarPreset(next.preset)
      setSearchParams(actuales => paramsDeRango(next, actuales), { replace: true })
    },
    [setSearchParams, recordarPreset],
  )
  const [filtroLista, setFiltroLista] = useUrlState('filtro', 'todas')
  const [creditos, setCreditos] = useState(null)
  const [metricas, setMetricas] = useState(null)
  const listaRef = useRef(null)

  // Aviso de cobranzas del inicio: vencido y por vencer en los próximos 7 días.
  useEffect(() => {
    if (isDemoRuntime) { setCreditos(null); return }
    let vigente = true
    api.get('/api/credits').then(data => { if (vigente) setCreditos(data?.totals || null) }).catch(() => { if (vigente) setCreditos(null) })
    return () => { vigente = false }
  }, [])

  // Métricas unificadas (#171, fase 2 de #145): la portada ejecutiva lee el
  // mismo backend que Análisis cuando hay sesión real. Si falla (demo, red o
  // permisos), la pantalla sigue con la caché local sin romperse.
  useEffect(() => {
    if (isDemoRuntime) { setMetricas(null); return }
    let vigente = true
    metricasEjecutivas({ rango, branchId: sucursal?.id })
      .then((datos) => { if (vigente) setMetricas(datos) })
      .catch(() => { if (vigente) setMetricas(null) })
    return () => { vigente = false }
  }, [rango, sucursal?.id])

  const vendedoresById = useMemo(
    () => Object.fromEntries(vendedores.map(v => [v.id, v.nombre])),
    [vendedores],
  )

  // Base local: el cálculo de siempre, que además alimenta la lista de ventas
  // y el papel. Encima se superponen los importes del backend unificado cuando
  // están disponibles (sin tope de caché y con la comparación del servidor).
  const base = useMemo(
    () => armarResumenDia({ ventas, gastos, prods, vendedoresById, rango, prev: rangoAnterior(rango) }),
    [ventas, gastos, prods, rango, vendedoresById],
  )
  const d = useMemo(
    () => (metricas ? {
      ...base,
      total: metricas.total,
      totalAnt: metricas.totalAnterior,
      cobrado: metricas.cobrado,
      pendiente: metricas.pendiente,
      ticket: metricas.ticket,
      ticketAnt: metricas.ticketAnterior,
      serie: metricas.serie.length ? metricas.serie : base.serie,
      ventas: metricas.pedidos,
      pagadas: metricas.pedidosPagados,
      sinPagar: metricas.pedidosPendientes,
      sinCosto: metricas.sinCosto,
    } : base),
    [base, metricas],
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

  // Applies the "Pendientes" filter on the sales list and brings it into view.
  function irAPendientes() {
    setFiltroLista('pendientes')
    setTimeout(() => listaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  return (
    <div className="space-y-5">
      <PendientesDeHoy pendientes={pendientesHoy} onIr={navigate} />

      {/* ── Encabezado + período ─────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="min-w-0 text-sm text-mute">
          Acá ves el movimiento de la tienda en el período elegido.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {metricas?.truncado && <Badge color="orange">El período supera el tope de ventas analizadas</Badge>}
          <RangoFechas valor={rango} onChange={cambiarRango} />
        </div>
      </div>

      {/* ── Facturado (hero) + accesos rápidos ───────────────────── */}
      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
        <CardFacturado
          total={d.total}
          totalAnt={d.totalAnt}
          cobrado={d.cobrado}
          pendiente={d.pendiente}
          pagadas={d.pagadas}
          sinPagar={d.sinPagar}
          pctCobrado={pctCobrado}
          etiqueta={etiquetaRango(rango)}
          onPendientes={irAPendientes}
        />
        <AccesosRapidos onIr={navigate} onImprimir={() => setResumenOpen(true)} />
      </div>

      {/* ── Métricas del período ─────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Metrica
          label="Ventas"
          valor={d.ventas}
          tono="blue"
          sub={`${d.pagadas} pagadas · ${d.sinPagar} pendientes`}
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
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-warn">
                    Costo pendiente: {d.sinCosto.lineas} {d.sinCosto.lineas === 1 ? 'línea' : 'líneas'} por {gs(d.sinCosto.monto)}
                    {d.total > 0 ? ` (${Math.round((d.sinCosto.monto / d.total) * 100)}% del período)` : ''}
                  </p>
                  <Badge color="orange">Margen real incompleto</Badge>
                </div>
                <p className="mt-1 text-xs text-mute">
                  Mientras haya ventas sin costo cargado, el margen real y las comisiones no son definitivos: cargá el costo del producto o de la línea.
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
                      style={{ width: `${base.total > 0 ? Math.min(100, (m.monto / base.total) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Indicadores unificados del servidor (#171, fase 2 de #145) ── */}
      {metricas && (
        <div className="grid grid-cols-1 gap-4 min-[1200px]:grid-cols-2">
          <CardTopProductos top={metricas.topProductos} curva={metricas.curva} />
          <CardStock inventario={metricas.inventario} />
        </div>
      )}
      {metricas && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <CardPagos titulo="Cobros por procesadora" detalle="Pagos del período" filas={metricas.procesadoras} vacio="Sin cobros por procesadora" />
          <CardPagos titulo="Cuentas con mayor ingreso" detalle="Pagos del período" filas={metricas.cuentas} vacio="Sin cobros por cuenta" />
          <CardConciliacion conciliacion={metricas.conciliacion} onIr={navigate} />
        </div>
      )}

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
              <span className="w-10 text-right">{base.act.length}</span>
              <span className="w-24 text-right font-semibold text-fore sm:w-28">{gs(base.total)}</span>
              <span className="hidden w-28 text-right text-ok sm:block">{gs(base.comision)}</span>
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
        titulo="Resumen ejecutivo"
        construir={(format) => {
          // El A4 es el reporte ejecutivo de una hoja; 58/80 mm siguen con el
          // HTML angosto y la impresión directa con el ticket.
          const datos = { ...d, rango, etiqueta: etiquetaRango(rango), empresa: empresa?.nombre || '', stockBajo, creditos }
          return format === 'a4' ? buildResumenEjecutivoHtml(datos) : buildResumenDiaHtml(datos, { format })
        }}
        directo={({ ancho }) => imprimirDocumento(ticketResumenDia({ ...d, rango, etiqueta: etiquetaRango(rango), empresa: empresa?.nombre || '' }, { ancho }), { tipo: 'resumen-dia' })}
      />
    </div>
  )
}
