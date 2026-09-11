import { useMemo } from 'react'
import { listVentas, getVendedores, productosById } from '@/lib/storage'
import { ventasDelDia, fechaClave, num, gs } from '@/utils/calculos'
import ListaVentasDia from './ListaVentasDia'
import MedioPago from '@/components/shared/MedioPago'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

const claveAyer = () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return fechaClave(d)
}
const inicial = (s) => (s || '?').trim().charAt(0).toUpperCase()

// Tarjeta de métrica: rótulo chico, número grande, contexto abajo.
function Metrica({ label, valor, children }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-gradient-to-br from-ink-700/60 to-ink-800 p-5 shadow-card">
      <div className="text-[10.5px] font-semibold uppercase tracking-[.08em] text-mute">{label}</div>
      <div className="mt-3 break-words text-[clamp(1.2rem,2vw,1.65rem)] font-semibold tracking-tight tabular-nums">
        {valor}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-mute">{children}</div>
    </div>
  )
}

function Panel({ titulo, extra, children }) {
  return (
    <div className="rounded-xl border border-fono/30 bg-ink-800">
      <div className="flex items-center justify-between gap-2 border-b border-fono/20 px-4 py-3">
        <span className="text-sm font-semibold">{titulo}</span>
        {extra}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

export default function PanelDia({ vendedoresById = {} }) {
  const ventas = listVentas()
  const vendedores = getVendedores()
  const prods = productosById()

  const d = useMemo(() => {
    const hoy = ventasDelDia(ventas, fechaClave())
    const ayer = ventasDelDia(ventas, claveAyer())
    const total = hoy.reduce((a, v) => a + num(v.precio), 0)
    const totalAyer = ayer.reduce((a, v) => a + num(v.precio), 0)
    const dif = total - totalAyer
    const pct = totalAyer > 0 ? (dif / totalAyer) * 100 : null
    const pagadas = hoy.filter((v) => v.estadoPago === 'Pagado').length

    const nombreV = Object.fromEntries(vendedores.map((v) => [v.id, v.nombre]))

    // Ranking del día
    const porVend = {}
    hoy.forEach((v) => {
      const k = v.vendedorId || 'sin'
      porVend[k] ??= { n: 0, total: 0 }
      porVend[k].n++
      porVend[k].total += num(v.precio)
    })
    const ranking = Object.entries(porVend)
      .map(([k, x]) => ({ id: k, nombre: nombreV[k] || 'Sin vendedor', ...x }))
      .sort((a, b) => b.total - a.total)

    // Entregas del día (delivery y encomienda)
    const entregas = hoy
      .filter((v) => v.entrega === 'Delivery' || v.entrega === 'Encomienda')
      .map((v) => ({
        id: v.id,
        cliente: v.cliente || 'Sin cliente',
        tipo: v.entrega,
        monto: num(v.montoDelivery),
      }))

    // Cobros confirmados, no confundir facturación con dinero recibido.
    const porMedio = {}
    hoy.forEach((v) => {
      const pagos = Array.isArray(v.pagos) ? v.pagos : []
      if (pagos.length) {
        pagos.forEach((p) => {
          if (p.status && p.status !== 'CONFIRMED') return
          const k = p.medioPago || '—'
          porMedio[k] = (porMedio[k] || 0) + num(p.monto)
        })
      } else if (v.estadoPago === 'Pagado') {
        const k = v.medioPago || '—'
        porMedio[k] = (porMedio[k] || 0) + num(v.totalPagado ?? v.precio)
      }
    })
    const medios = Object.entries(porMedio)
      .map(([medio, monto]) => ({ medio, monto }))
      .sort((a, b) => b.monto - a.monto)

    return {
      hoy, total, totalAyer, dif, pct, pagadas,
      pendientes: hoy.length - pagadas,
      ticket: hoy.length ? total / hoy.length : 0,
      ranking, entregas, medios,
    }
  }, [ventas, vendedores, prods])

  const sube = d.dif >= 0
  const maxVend = Math.max(...d.ranking.map((r) => r.total), 1)

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
      {/* ── Columna principal ────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-5">
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <Metrica label="Ventas de hoy" valor={gs(d.total)}>
            <span className="whitespace-nowrap">Ayer {gs(d.totalAyer)}</span>
            {d.pct != null && (
              <span className={cn('whitespace-nowrap font-medium', sube ? 'text-ok' : 'text-bad')}>
                {sube ? '+' : '−'}
                {Math.abs(d.pct).toFixed(1)}%
              </span>
            )}
          </Metrica>
          <Metrica label="Cantidad de ventas" valor={d.hoy.length}>
            <span className="whitespace-nowrap text-ok">{d.pagadas} pagadas</span>
            <span className="whitespace-nowrap text-bad">{d.pendientes} pendientes</span>
          </Metrica>
          <Metrica label="Ticket promedio" valor={gs(d.ticket)}>
            <span>Sobre {d.hoy.length} ventas del día</span>
          </Metrica>
        </div>

        <ListaVentasDia vendedorId={null} mostrarVendedor vendedoresById={vendedoresById} />
      </div>

      {/* ── Columna lateral ──────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <Panel titulo="Vendedores hoy">
          {d.ranking.length === 0 ? (
            <p className="py-4 text-center text-sm text-mute">Nadie cargó ventas todavía</p>
          ) : (
            <div className="space-y-3">
              {d.ranking.map((r, i) => (
                <div key={r.id}>
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                        i === 0 ? 'bg-fono text-white' : 'bg-ink-600 text-mute',
                      )}
                    >
                      {inicial(r.nombre)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{r.nombre}</div>
                      <div className="text-[11px] text-mute">{r.n} ventas</div>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {gs(r.total)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink-600">
                    <div
                      className={cn('h-full rounded-full', i === 0 ? 'bg-ok' : 'bg-fono')}
                      style={{ width: `${(r.total / maxVend) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          titulo="Entregas de hoy"
          extra={
            <span className="rounded-full border border-fono/30 bg-fono/10 px-2 py-0.5 text-[11px] font-medium text-fono-light">
              {d.entregas.length}
            </span>
          }
        >
          {d.entregas.length === 0 ? (
            <p className="py-4 text-center text-sm text-mute">Sin envíos hoy</p>
          ) : (
            <div className="space-y-2.5">
              {d.entregas.map((e) => (
                <div key={e.id} className="flex items-center gap-2.5">
                  <Icon
                    name={e.tipo === 'Delivery' ? 'truck' : 'package'}
                    className="h-4 w-4 shrink-0 text-fono-light"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{e.cliente}</div>
                    <div className="text-[11px] text-mute">{e.tipo}</div>
                  </div>
                  <span className="shrink-0 text-sm font-medium tabular-nums">{gs(e.monto)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel titulo="Cobrado por medio de pago">
          {d.medios.length === 0 ? (
            <p className="py-4 text-center text-sm text-mute">Sin datos</p>
          ) : (
            <div className="space-y-2.5">
              {d.medios.map((m) => (
                <div key={m.medio} className="flex items-center justify-between gap-2">
                  <MedioPago medio={m.medio} alto="h-4" />
                  <span className="text-sm font-medium tabular-nums">{gs(m.monto)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
