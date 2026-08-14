import { useMemo, useState } from 'react'
import { listVentas, getVendedores, productosById, listGastos } from '@/lib/storage'
import { comisionDeVentas, fechaClave, num, gs } from '@/utils/calculos'
import ListaVentasDia from '@/components/ventas/ListaVentasDia'
import RangoFechas, {
  rangoPorDefecto,
  rangoAnterior,
  etiquetaRango,
} from '@/components/shared/RangoFechas'
import Icon from '@/components/shared/Icon'
import MedioPago from '@/components/shared/MedioPago'
import { Card, Badge, Dot, Stat } from '@/components/ui'
import { cn } from '@/lib/utils'

// Métrica al estilo del tablero: rótulo, número grande, indicador de tendencia
// y una línea de contexto abajo. Van en fila separadas por divisores.
function Metrica({ label, valor, delta, sub, tono = 'blue' }) {
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
    </div>
  )
}

const enRango = (v, r) => v.fecha >= r.desde && v.fecha <= r.hasta
const suma = (arr, f = (x) => num(x.precio)) => arr.reduce((a, x) => a + f(x), 0)
const variacion = (hoy, antes) => (antes > 0 ? ((hoy - antes) / antes) * 100 : null)

export default function Resumen() {
  const ventas = listVentas()
  const vendedores = getVendedores()
  const gastos = listGastos()
  const prods = productosById()
  const [rango, setRango] = useState(rangoPorDefecto)

  const vendedoresById = useMemo(
    () => Object.fromEntries(vendedores.map((v) => [v.id, v.nombre])),
    [vendedores],
  )

  const d = useMemo(() => {
    const prev = rangoAnterior(rango)
    const act = ventas.filter((v) => enRango(v, rango))
    const ant = ventas.filter((v) => enRango(v, prev))
    const gastosR = gastos.filter((g) => enRango(g, rango))

    const total = suma(act)
    const totalAnt = suma(ant)
    const comision = comisionDeVentas(act, prods)
    const delivery = suma(act, (x) => num(x.montoDelivery))
    const ticket = act.length ? total / act.length : 0
    const ticketAnt = ant.length ? totalAnt / ant.length : 0

    // Por vendedor
    const porVend = {}
    act.forEach((v) => {
      const k = v.vendedorId || 'sin'
      porVend[k] ??= { n: 0, total: 0, com: 0 }
      porVend[k].n++
      porVend[k].total += num(v.precio)
      porVend[k].com += num(v.comision ?? prods[v.productoId]?.comision)
    })
    const ranking = Object.entries(porVend)
      .map(([k, x]) => ({ id: k, nombre: vendedoresById[k] || 'Sin vendedor', ...x }))
      .sort((a, b) => b.total - a.total)

    // Por medio de pago
    const porMedio = {}
    act.forEach((v) => {
      const k = v.medioPago || '—'
      porMedio[k] = (porMedio[k] || 0) + num(v.precio)
    })
    const medios = Object.entries(porMedio)
      .map(([medio, monto]) => ({ medio, monto, pct: total > 0 ? (monto / total) * 100 : 0 }))
      .sort((a, b) => b.monto - a.monto)

    // Serie diaria (para el mini-gráfico)
    const porDia = {}
    act.forEach((v) => (porDia[v.fecha] = (porDia[v.fecha] || 0) + num(v.precio)))
    const serie = Object.entries(porDia).sort(([a], [b]) => a.localeCompare(b))

    const pagadas = act.filter((v) => v.estadoPago === 'Pagado').length

    return {
      act,
      total,
      totalAnt,
      comision,
      delivery,
      ticket,
      ticketAnt,
      ranking,
      medios,
      serie,
      pagadas,
      sinPagar: act.length - pagadas,
      gastos: suma(gastosR, (x) => num(x.monto)),
      prev,
    }
  }, [ventas, gastos, prods, rango, vendedoresById])

  const maxSerie = Math.max(...d.serie.map(([, v]) => v), 1)
  const maxVend = Math.max(...d.ranking.map((r) => r.total), 1)

  return (
    <div className="space-y-5">
      {/* ── Encabezado + período ─────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Resumen general</h1>
          <p className="mt-0.5 text-sm text-mute">
            Acá ves el movimiento de la tienda en el período elegido.
          </p>
        </div>
        <RangoFechas valor={rango} onChange={setRango} />
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* ── Evolución diaria ───────────────────────────────────── */}
        <Card className="xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium">Evolución</h2>
            <Badge color="blue">{d.serie.length} días con ventas</Badge>
          </div>
          {d.serie.length === 0 ? (
            <div className="py-14 text-center text-sm text-mute">Sin ventas en este período</div>
          ) : (
            <div className="flex h-44 items-end gap-1.5">
              {d.serie.map(([f, v]) => (
                <div key={f} className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <div className="pointer-events-none absolute -top-8 z-10 hidden whitespace-nowrap rounded-md border border-ink-500 bg-ink px-2 py-1 text-xs group-hover:block">
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
            <div className="py-14 text-center text-sm text-mute">Sin datos</div>
          ) : (
            <div className="space-y-3">
              {d.medios.map((m) => (
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

      {/* ── Vendedores ───────────────────────────────────────────── */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-medium">Rendimiento por vendedor</h2>
          <span className="text-xs text-mute">{etiquetaRango(rango)}</span>
        </div>
        {d.ranking.length === 0 ? (
          <div className="py-10 text-center text-sm text-mute">Sin ventas en este período</div>
        ) : (
          <div className="space-y-1">
            {d.ranking.map((v, i) => (
              <div
                key={v.id}
                className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-ink-700"
              >
                <span className="w-5 text-center text-xs font-medium text-mute">{i + 1}</span>
                <Dot color={i === 0 ? 'green' : v.total > 0 ? 'blue' : 'slate'} />
                <span className="w-32 shrink-0 truncate text-sm font-medium">{v.nombre}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-600">
                  <div
                    className={cn('h-full rounded-full', i === 0 ? 'bg-ok' : 'bg-blue-line')}
                    style={{ width: `${(v.total / maxVend) * 100}%` }}
                  />
                </div>
                <span className="w-10 text-right text-xs text-mute">{v.n}</span>
                <span className="w-28 text-right text-sm font-semibold">{gs(v.total)}</span>
                <span className="hidden w-28 text-right text-sm text-ok sm:block">{gs(v.com)}</span>
              </div>
            ))}
            <div className="mt-2 flex items-center gap-3 border-t border-ink-600 px-2 pt-3 text-xs text-mute">
              <span className="w-5" />
              <span className="w-2" />
              <span className="w-32 shrink-0">Total</span>
              <span className="flex-1" />
              <span className="w-10 text-right">{d.act.length}</span>
              <span className="w-28 text-right font-semibold text-white">{gs(d.total)}</span>
              <span className="hidden w-28 text-right text-ok sm:block">{gs(d.comision)}</span>
            </div>
          </div>
        )}
      </Card>

      {/* ── Detalle de ventas ────────────────────────────────────── */}
      <ListaVentasDia
        rango={rango}
        mostrarVendedor
        vendedoresById={vendedoresById}
        titulo="Detalle de ventas"
      />
    </div>
  )
}
