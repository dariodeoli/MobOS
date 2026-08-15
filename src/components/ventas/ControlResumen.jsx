import { useMemo } from 'react'
import { listVentas, getVendedores, productosById, getProductos, listGastos, listAds } from '@/lib/storage'
import { comisionDeVentas, fechaClave, num, gs } from '@/utils/calculos'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

const inicial = (s) => (s || '?').trim().charAt(0).toUpperCase()

// Métrica de la fila superior: rótulo, número grande y contexto.
function Metrica({ label, valor, sub, tono }) {
  return (
    <div className="min-w-0 rounded-xl border border-fono/30 bg-ink-800 p-[18px]">
      <div className="text-[10.5px] font-semibold uppercase tracking-[.08em] text-mute">{label}</div>
      <div
        className={cn(
          'mt-2 whitespace-nowrap text-[25px] font-semibold tracking-tight tabular-nums',
          tono,
        )}
      >
        {valor}
      </div>
      {sub && <div className="mt-2 text-xs text-mute">{sub}</div>}
    </div>
  )
}

export default function ControlResumen({ onAbrirPanel }) {
  const ventas = listVentas()
  const vendedores = getVendedores()
  const productos = getProductos()
  const prods = productosById()
  const gastos = listGastos()
  const ads = listAds()

  const d = useMemo(() => {
    const mes = fechaClave().slice(0, 7) // YYYY-MM
    const enMes = (f) => (f || '').startsWith(mes)

    const delMes = ventas.filter((v) => enMes(v.fecha))
    const ingresos = delMes.reduce((a, v) => a + num(v.precio), 0)
    // Costo de mercadería: foto guardada en la venta; si falta, el costo actual.
    const costo = delMes.reduce(
      (a, v) => a + num(v.precioCosto ?? prods[v.productoId]?.precioCosto),
      0,
    )
    const gastosMes = gastos.filter((g) => enMes(g.fecha)).reduce((a, g) => a + num(g.monto), 0)
    const adsMes = ads.filter((x) => enMes(x.fecha)).reduce((a, x) => a + num(x.monto), 0)
    const egresos = gastosMes + adsMes
    const ganancia = ingresos - costo - egresos

    const hoy = fechaClave()
    const equipo = vendedores
      .filter((v) => v.activo !== false)
      .map((v) => {
        const susMes = delMes.filter((x) => x.vendedorId === v.id)
        const susHoy = ventas.filter((x) => x.fecha === hoy && x.vendedorId === v.id)
        const totalHoy = susHoy.reduce((a, x) => a + num(x.precio), 0)
        const meta = num(v.metaDiaria)
        return {
          id: v.id,
          nombre: v.nombre,
          meta,
          totalHoy,
          pct: meta > 0 ? Math.min(Math.round((totalHoy / meta) * 100), 100) : totalHoy > 0 ? 100 : 0,
          comisionMes: comisionDeVentas(susMes, prods),
          cumple: meta > 0 && totalHoy >= meta,
        }
      })
      .sort((a, b) => b.totalHoy - a.totalHoy)

    const bajos = productos
      .filter((p) => p.activo !== false && num(p.stock) <= 3)
      .sort((a, b) => num(a.stock) - num(b.stock))
      .slice(0, 8)

    return { ingresos, costo, egresos, gastosMes, adsMes, ganancia, equipo, bajos, cant: delMes.length }
  }, [ventas, vendedores, productos, prods, gastos, ads])

  const margen = d.ingresos > 0 ? (d.ganancia / d.ingresos) * 100 : 0

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Centro de control</h1>
          <p className="mt-0.5 text-sm text-mute">Resultado del mes y avance del equipo.</p>
        </div>
        {onAbrirPanel && (
          <button
            onClick={onAbrirPanel}
            className="inline-flex h-[34px] items-center gap-2 rounded-[9px] border border-fono/30 bg-ink-800 px-3.5 text-[13px] text-mute transition hover:text-white"
          >
            Ver panel completo
            <Icon name="chevron" className="h-4 w-4 -rotate-90" />
          </button>
        )}
      </div>

      {/* ── Resultado del mes ────────────────────────────────────── */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Metrica
          label="Ingresos del mes"
          valor={gs(d.ingresos)}
          sub={`${d.cant} ventas`}
        />
        <Metrica label="Costo mercadería" valor={gs(d.costo)} sub="Lo que costó lo vendido" />
        <Metrica
          label="Gastos + publicidad"
          valor={gs(d.egresos)}
          sub={`Gastos ${gs(d.gastosMes)} · Ads ${gs(d.adsMes)}`}
        />
        <Metrica
          label="Ganancia"
          valor={gs(d.ganancia)}
          tono={d.ganancia >= 0 ? 'text-ok' : 'text-bad'}
          sub={`Margen ${margen.toFixed(1)}%`}
        />
      </div>

      {/* ── Funcionarios y metas ─────────────────────────────────── */}
      <div className="rounded-xl border border-fono/30 bg-ink-800">
        <div className="border-b border-fono/20 px-5 py-4">
          <h2 className="font-semibold">Funcionarios y metas</h2>
          <p className="mt-0.5 text-xs text-mute">
            Meta diaria, avance de hoy y comisión acumulada del mes.
          </p>
        </div>

        {d.equipo.length === 0 ? (
          <p className="py-10 text-center text-sm text-mute">No hay vendedores cargados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-600 text-left text-xs font-medium text-mute">
                  <th className="px-5 py-3">Vendedor</th>
                  <th className="px-5 py-3 text-right">Meta diaria</th>
                  <th className="px-5 py-3">Avance</th>
                  <th className="px-5 py-3 text-right">Comisión mes</th>
                  <th className="px-5 py-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {d.equipo.map((e) => (
                  <tr key={e.id} className="border-b border-ink-600/60 transition hover:bg-ink-700">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                            e.cumple ? 'bg-ok text-white' : 'bg-ink-600 text-mute',
                          )}
                        >
                          {inicial(e.nombre)}
                        </span>
                        <span className="font-medium">{e.nombre}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-mute">
                      {e.meta > 0 ? gs(e.meta) : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-ink-600">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              e.cumple ? 'bg-ok' : 'bg-blue-line',
                            )}
                            style={{ width: `${e.pct}%` }}
                          />
                        </div>
                        <span className="tabular-nums">{gs(e.totalHoy)}</span>
                        <span className="text-xs text-mute">{e.pct}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums text-ok">
                      {gs(e.comisionMes)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium',
                          e.cumple
                            ? 'border-ok/25 bg-ok/15 text-ok'
                            : 'border-fono/25 bg-fono/10 text-fono-light',
                        )}
                      >
                        {e.cumple ? 'Meta superada' : 'En camino'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Inventario bajo ──────────────────────────────────────── */}
      <div className="rounded-xl border border-fono/30 bg-ink-800">
        <div className="flex items-center justify-between gap-2 border-b border-fono/20 px-5 py-4">
          <h2 className="font-semibold">Inventario bajo</h2>
          <span className="rounded-full border border-fono/30 bg-fono/10 px-2 py-0.5 text-[11px] font-medium text-fono-light">
            {d.bajos.length}
          </span>
        </div>
        <div className="p-5">
          {d.bajos.length === 0 ? (
            <p className="py-4 text-center text-sm text-mute">Todo con stock suficiente.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {d.bajos.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-ink-600 px-3 py-2.5"
                >
                  <span className="min-w-0 truncate text-sm">{p.nombre}</span>
                  <span
                    className={cn(
                      'shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold',
                      num(p.stock) <= 0 ? 'bg-bad/15 text-bad' : 'bg-warn/15 text-warn',
                    )}
                  >
                    {num(p.stock)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
