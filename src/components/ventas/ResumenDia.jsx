import { useMemo } from 'react'
import { listVentas, getVendedores, productosById } from '@/lib/storage'
import { ventasDelDia, fechaClave, num, gs } from '@/utils/calculos'
import MedioPago from '@/components/shared/MedioPago'
import Icon from '@/components/shared/Icon'
import { Dot } from '@/components/ui'
import { cn } from '@/lib/utils'

// Tarjeta base del dashboard: borde azul, fondo oscuro.
function Caja({ className, children, destacada = false }) {
  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        destacada ? 'border-fono/50 bg-blue-blur' : 'border-fono/30 bg-ink-800',
        className,
      )}
    >
      {children}
    </div>
  )
}

const claveAyer = () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return fechaClave(d)
}

export default function ResumenDia() {
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

    const nombreV = Object.fromEntries(vendedores.map((v) => [v.id, v.nombre]))
    const nombreP = (v) => v.productoNombre || prods[v.productoId]?.nombre || 'Producto'

    // Ranking del día por vendedor
    const porVend = {}
    hoy.forEach((v) => {
      const k = v.vendedorId || 'sin'
      porVend[k] ??= { n: 0, total: 0 }
      porVend[k].n++
      porVend[k].total += num(v.precio)
    })
    const ranking = Object.entries(porVend)
      .map(([k, x]) => ({
        id: k,
        nombre: nombreV[k] || 'Sin vendedor',
        ...x,
        pct: total > 0 ? (x.total / total) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total)

    // Venta más alta del día
    const mayor = hoy.reduce((mx, v) => (num(v.precio) > num(mx?.precio ?? 0) ? v : mx), null)

    // Producto más vendido (por unidades; desempata por monto)
    const porProd = {}
    hoy.forEach((v) => {
      const k = nombreP(v)
      porProd[k] ??= { n: 0, total: 0 }
      porProd[k].n++
      porProd[k].total += num(v.precio)
    })
    const productos = Object.entries(porProd)
      .map(([nombre, x]) => ({ nombre, ...x }))
      .sort((a, b) => b.n - a.n || b.total - a.total)

    // Ritmo del día: acumulado por hora (usa la hora real de carga)
    const porHora = new Array(24).fill(0)
    hoy.forEach((v) => {
      const h = v.creadoEn ? new Date(v.creadoEn).getHours() : null
      if (h != null && h >= 0 && h < 24) porHora[h] += num(v.precio)
    })
    const conMov = porHora.map((v, h) => ({ h, v })).filter((x) => x.v > 0)
    const desde = conMov.length ? Math.max(0, conMov[0].h - 1) : 8
    const hasta = conMov.length ? Math.min(23, conMov[conMov.length - 1].h + 1) : 20
    const ritmo = porHora.slice(desde, hasta + 1).map((v, i) => ({ h: desde + i, v }))

    // Medios de pago del día
    const porMedio = {}
    hoy.forEach((v) => (porMedio[v.medioPago || '—'] = (porMedio[v.medioPago || '—'] || 0) + num(v.precio)))
    const medios = Object.entries(porMedio)
      .map(([medio, monto]) => ({ medio, monto }))
      .sort((a, b) => b.monto - a.monto)

    return {
      hoy, total, totalAyer, dif, pct, ranking, mayor, productos, ritmo, medios,
      nombreV, nombreP,
      pagadas: hoy.filter((v) => v.estadoPago === 'Pagado').length,
    }
  }, [ventas, vendedores, prods])

  const sube = d.dif >= 0
  const maxRitmo = Math.max(...d.ritmo.map((x) => x.v), 1)
  const maxProd = Math.max(...d.productos.map((p) => p.total), 1)

  return (
    <div className="space-y-4">
      {/* ── Cifra protagonista ───────────────────────────────────── */}
      <Caja destacada className="glow-blue relative overflow-hidden">
        <div className="relative">
          <div className="text-[11px] font-medium uppercase tracking-wider text-white/60">
            Ventas de hoy
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span className="text-4xl font-semibold tracking-tight md:text-5xl">{gs(d.total)}</span>
            {d.pct != null && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium',
                  sube ? 'bg-ok/20 text-ok' : 'bg-bad/20 text-bad',
                )}
              >
                {sube ? '↑' : '↓'} {Math.abs(d.pct).toFixed(1)}%
              </span>
            )}
            {d.totalAyer > 0 && (
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 text-sm font-medium',
                  sube ? 'bg-white/15 text-white' : 'bg-white/10 text-white/80',
                )}
              >
                {sube ? '+' : '−'} {gs(Math.abs(d.dif))}
              </span>
            )}
          </div>
          <div className="mt-2 text-sm text-white/60">
            {d.totalAyer > 0 ? `Ayer ${gs(d.totalAyer)}` : 'Sin referencia de ayer'} ·{' '}
            {d.hoy.length} {d.hoy.length === 1 ? 'venta' : 'ventas'} · {d.pagadas} pagadas
          </div>
        </div>
      </Caja>

      {/* ── Tarjetas destacadas ──────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* Venta más alta */}
        <Caja>
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-mute">
            <Icon name="trophy" className="h-4 w-4 text-fono-light" />
            Venta más alta del día
          </div>
          {d.mayor ? (
            <>
              <div className="mt-2 text-2xl font-semibold tracking-tight">{gs(d.mayor.precio)}</div>
              <div className="mt-1 truncate text-sm text-mute">
                {d.mayor.cliente || 'Sin cliente'} · {d.nombreP(d.mayor)}
              </div>
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-fono/15 px-2 py-0.5 text-xs text-fono-light">
                <Icon name="user" className="h-3.5 w-3.5" />
                {d.nombreV[d.mayor.vendedorId] || 'Sin vendedor'}
              </div>
            </>
          ) : (
            <div className="py-6 text-center text-sm text-mute">Todavía no hay ventas hoy</div>
          )}
        </Caja>

        {/* Producto más vendido */}
        <Caja>
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-mute">
            <Icon name="box" className="h-4 w-4 text-fono-light" />
            Productos más vendidos
          </div>
          {d.productos.length === 0 ? (
            <div className="py-6 text-center text-sm text-mute">Sin datos</div>
          ) : (
            <div className="mt-2.5 space-y-2">
              {d.productos.slice(0, 4).map((p) => (
                <div key={p.nombre}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{p.nombre}</span>
                    <span className="shrink-0 text-mute">
                      {p.n}× · <span className="font-medium text-white">{gs(p.total)}</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink-600">
                    <div
                      className="h-full rounded-full bg-blue-line"
                      style={{ width: `${(p.total / maxProd) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Caja>
      </div>

      {/* ── Ranking del día ──────────────────────────────────────── */}
      <Caja>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-mute">
            <Icon name="users" className="h-4 w-4 text-fono-light" />
            Ranking de hoy
          </div>
          <span className="text-xs text-mute">{d.ranking.length} vendiendo</span>
        </div>

        {d.ranking.length === 0 ? (
          <div className="py-6 text-center text-sm text-mute">Nadie cargó ventas todavía</div>
        ) : (
          <>
            {/* Barra segmentada con la participación de cada uno */}
            <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-ink-600">
              {d.ranking.map((r, i) => (
                <div
                  key={r.id}
                  title={`${r.nombre} · ${r.pct.toFixed(1)}%`}
                  className={cn('h-full', i === 0 ? 'bg-ok' : 'bg-fono')}
                  style={{ width: `${r.pct}%`, opacity: 1 - i * 0.15 }}
                />
              ))}
            </div>

            <div className="space-y-1">
              {d.ranking.map((r, i) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-ink-700"
                >
                  <span className="w-4 text-center text-xs font-medium text-mute">{i + 1}</span>
                  <Dot color={i === 0 ? 'green' : 'blue'} pulse={i === 0} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.nombre}</span>
                  <span className="text-xs text-mute">{r.n} vts</span>
                  <span className="w-12 text-right text-xs text-mute">{r.pct.toFixed(0)}%</span>
                  <span className="w-28 text-right text-sm font-semibold">{gs(r.total)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Caja>

      {/* ── Ritmo del día + medios de pago ───────────────────────── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Caja className="lg:col-span-2">
          <div className="mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-mute">
            <Icon name="pulse" className="h-4 w-4 text-fono-light" />
            Ritmo del día
          </div>
          {d.total === 0 ? (
            <div className="py-12 text-center text-sm text-mute">Sin movimiento todavía</div>
          ) : (
            <div className="flex h-36 items-end gap-1">
              {d.ritmo.map(({ h, v }) => (
                <div key={h} className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  {v > 0 && (
                    <div className="pointer-events-none absolute -top-7 z-10 hidden whitespace-nowrap rounded-md border border-ink-500 bg-ink px-2 py-1 text-xs group-hover:block">
                      {gs(v)}
                    </div>
                  )}
                  <div
                    className={cn(
                      'w-full rounded-t transition',
                      v > 0 ? 'bg-blue-line opacity-85 group-hover:opacity-100' : 'bg-ink-600',
                    )}
                    style={{ height: `${v > 0 ? Math.max((v / maxRitmo) * 100, 4) : 2}%` }}
                  />
                  <span className="text-[10px] text-mute">{h}</span>
                </div>
              ))}
            </div>
          )}
        </Caja>

        <Caja>
          <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-mute">
            <Icon name="wallet" className="h-4 w-4 text-fono-light" />
            Entró por
          </div>
          {d.medios.length === 0 ? (
            <div className="py-8 text-center text-sm text-mute">Sin datos</div>
          ) : (
            <div className="space-y-2.5">
              {d.medios.map((m) => (
                <div key={m.medio} className="flex items-center justify-between gap-2">
                  <MedioPago medio={m.medio} alto="h-4" />
                  <span className="text-sm font-medium">{gs(m.monto)}</span>
                </div>
              ))}
            </div>
          )}
        </Caja>
      </div>
    </div>
  )
}
