import { useMemo, useState } from 'react'
import { listVentas, productosById } from '@/lib/storage'
import { ventasDelDia, fechaClave, num, gs } from '@/utils/calculos'
import FormularioVenta from './FormularioVenta'
import MedioPago from '@/components/shared/MedioPago'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

const POR_PAGINA = 8
// 'YYYY-MM-DD' -> 'DD/MM/YY'
const fmtFecha = (f) => {
  const [y, m, d] = (f || '').split('-')
  return d ? `${d}/${m}/${y.slice(2)}` : '—'
}
const inicial = (s) => (s || '?').trim().charAt(0).toUpperCase()

function Caja({ className, children }) {
  return (
    <div className={cn('rounded-[14px] border border-fono/30 bg-ink-800', className)}>{children}</div>
  )
}

export default function VistaCargarVenta({ vendedoresById = {} }) {
  const ventas = listVentas()
  const prods = productosById()
  const [carrito, setCarrito] = useState({ items: [], quitar: null })
  const [pagina, setPagina] = useState(1)

  const d = useMemo(() => {
    const hoy = ventasDelDia(ventas, fechaClave())
    const total = hoy.reduce((a, v) => a + num(v.precio), 0)
    // Las últimas cargadas, de la más reciente a la más vieja.
    const ultimas = [...ventas]
      .sort((a, b) => (b.creadoEn || '').localeCompare(a.creadoEn || ''))
      .slice(0, 40)
    // Número visible por venta, según el orden en que se fueron cargando.
    const orden = [...ventas].sort((a, b) => (a.creadoEn || '').localeCompare(b.creadoEn || ''))
    const nro = Object.fromEntries(orden.map((v, i) => [v.id, 1041 + i]))
    return {
      total,
      cant: hoy.length,
      ticket: hoy.length ? total / hoy.length : 0,
      ultimas,
      nro,
    }
  }, [ventas])

  const totalCompra = carrito.items.reduce((a, it) => a + it.precio, 0)
  const paginas = Math.max(1, Math.ceil(d.ultimas.length / POR_PAGINA))
  const pag = Math.min(pagina, paginas)
  const filas = d.ultimas.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA)
  const nombreProd = (v) => v.productoNombre || prods[v.productoId]?.nombre || '—'

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
      {/* ── Columna principal ────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-5">
        <FormularioVenta ocultarCarrito onCarrito={setCarrito} />

        {/* Últimas cargadas */}
        <Caja className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-fono/20 px-5 py-4">
            <h2 className="font-semibold">Últimas cargadas</h2>
            <span className="text-xs text-mute">
              {d.ultimas.length === 0
                ? 'Sin ventas'
                : `Mostrando ${(pag - 1) * POR_PAGINA + 1} a ${Math.min(pag * POR_PAGINA, d.ultimas.length)} de ${d.ultimas.length}`}
            </span>
          </div>

          {d.ultimas.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <Icon name="receipt" className="mx-auto mb-3 h-8 w-8 text-ink-500" />
              <p className="text-sm text-mute">Todavía no hay ventas cargadas.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-600 text-left text-xs font-medium text-mute">
                      <th className="px-5 py-3">N° venta</th>
                      <th className="px-5 py-3">Fecha</th>
                      <th className="px-5 py-3">Cliente</th>
                      <th className="px-5 py-3">Producto</th>
                      <th className="px-5 py-3 text-right">Precio</th>
                      <th className="px-5 py-3">Medio de pago</th>
                      <th className="px-5 py-3">Estado</th>
                      <th className="px-5 py-3">Vendedor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((v) => {
                      const pagado = v.estadoPago === 'Pagado'
                      return (
                        <tr
                          key={v.id}
                          className="border-b border-ink-600/60 transition hover:bg-ink-700"
                        >
                          <td className="px-5 py-3 font-medium text-fono-light">
                            VTA-{d.nro[v.id]}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-mute">
                            <div className="tabular-nums">{fmtFecha(v.fecha)}</div>
                            {v.creadoEn && (
                              <div className="text-[11px] text-mute/70">
                                {new Date(v.creadoEn).toLocaleTimeString('es-PY', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-600 text-xs font-semibold text-mute">
                                {inicial(v.cliente)}
                              </span>
                              <span className="font-medium">{v.cliente || '—'}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-mute">{nombreProd(v)}</td>
                          <td className="px-5 py-3 text-right font-semibold tabular-nums">
                            {gs(v.precio)}
                          </td>
                          <td className="px-5 py-3">
                            <MedioPago medio={v.medioPago} alto="h-4" />
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
                                pagado
                                  ? 'border-ok/25 bg-ok/15 text-ok'
                                  : 'border-bad/25 bg-bad/15 text-bad',
                              )}
                            >
                              <span
                                className={cn(
                                  'h-1.5 w-1.5 rounded-full',
                                  pagado ? 'bg-ok' : 'bg-bad',
                                )}
                              />
                              {pagado ? 'Pagado' : 'No pagado'}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-mute">
                            {vendedoresById[v.vendedorId] || '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {paginas > 1 && (
                <div className="flex items-center justify-between gap-2 px-5 py-3">
                  <button
                    onClick={() => setPagina((p) => Math.max(1, p - 1))}
                    disabled={pag === 1}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-500 px-3 text-xs text-mute transition hover:text-white disabled:opacity-30"
                  >
                    <Icon name="chevron" className="h-3.5 w-3.5 rotate-90" /> Anterior
                  </button>
                  <div className="flex gap-1">
                    {Array.from({ length: paginas }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        onClick={() => setPagina(n)}
                        className={cn(
                          'h-8 w-8 rounded-lg text-xs transition',
                          n === pag
                            ? 'bg-fono font-semibold text-white'
                            : 'text-mute hover:bg-ink-700 hover:text-white',
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setPagina((p) => Math.min(paginas, p + 1))}
                    disabled={pag === paginas}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-500 px-3 text-xs text-mute transition hover:text-white disabled:opacity-30"
                  >
                    Siguiente <Icon name="chevron" className="h-3.5 w-3.5 -rotate-90" />
                  </button>
                </div>
              )}
            </>
          )}
        </Caja>
      </div>

      {/* ── Columna lateral ──────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        {/* Esta compra */}
        <Caja>
          <div className="flex items-center justify-between gap-2 border-b border-fono/20 px-5 py-3.5">
            <span className="font-semibold">Esta compra</span>
            <span className="text-xs text-mute">
              {carrito.items.length} {carrito.items.length === 1 ? 'producto' : 'productos'}
            </span>
          </div>
          {carrito.items.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-mute">
              Todavía no agregaste productos.
            </p>
          ) : (
            <>
              <div className="divide-y divide-ink-600">
                {carrito.items.map((it) => (
                  <div key={it.key} className="flex items-center justify-between gap-2 px-5 py-2.5">
                    <span className="min-w-0 truncate text-sm">{it.nombre}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-medium tabular-nums">{gs(it.precio)}</span>
                      {it.key !== '__actual__' && carrito.quitar && (
                        <button
                          onClick={() => carrito.quitar(it.key)}
                          className="text-mute transition hover:text-bad"
                          title="Quitar"
                        >
                          <Icon name="trash" className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-fono/20 px-5 py-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-mute">
                  Total
                </span>
                <span className="text-lg font-semibold tabular-nums">{gs(totalCompra)}</span>
              </div>
            </>
          )}
        </Caja>

        {/* Acumulado del día */}
        <div className="rounded-[14px] border border-fono/40 bg-blue-blur p-[18px]">
          <div className="text-[10.5px] font-semibold uppercase tracking-[.08em] text-white/60">
            Acumulado del día
          </div>
          <div className="mt-1.5 text-[28px] font-semibold tracking-tight tabular-nums">
            {gs(d.total)}
          </div>
          <div className="mt-1.5 text-[11.5px] text-white/60">
            {d.cant} {d.cant === 1 ? 'venta' : 'ventas'} · ticket {gs(d.ticket)}
          </div>
        </div>

        {/* Ayuda */}
        <div className="flex gap-2.5 rounded-[14px] border border-fono/25 bg-fono/[.07] p-4">
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-fono-light" />
          <p className="text-xs leading-relaxed text-mute">
            Si el cliente lleva varios productos, agregalos a la lista antes de guardar: quedan
            agrupados como una sola compra y el envío se cobra una vez.
          </p>
        </div>
      </div>
    </div>
  )
}
