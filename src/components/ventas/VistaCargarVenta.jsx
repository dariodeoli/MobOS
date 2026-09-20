import { useMemo, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import { listVentas } from '@/lib/storage'
import {
  ventasDelDia,
  totalesVendedor,
  cobradoDeVenta,
  fechaClave,
  num,
  gs,
} from '@/utils/calculos'
import FormularioVenta from './FormularioVenta'
import { usePantallaAngosta } from '@/hooks/usePantallaAngosta'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'
import { serialEnmascarado } from '@/utils/serial'

function Caja({ className, children, ...props }) {
  return (
    <div {...props} className={cn('rounded-[14px] border border-fono/30 bg-ink-800', className)}>
      {children}
    </div>
  )
}

// Total de la venta en curso: monto, cantidad de productos y acceso directo a
// revisar el carrito sin tener que bajar por el formulario.
function TotalVenta({ carrito, totalCompra, unidadesCarrito }) {
  return (
    <div className="rounded-[14px] border border-fono/40 bg-gradient-to-br from-fono-dark via-fono to-fono p-[18px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[.08em] text-onbrand/75">
          Total de esta venta
        </span>
        <Icon name="cart" className="h-4 w-4 text-onbrand/80" />
      </div>
      <div className="mt-1.5 text-[28px] font-semibold tracking-tight tabular-nums text-onbrand">
        {gs(totalCompra)}
      </div>
      <div className="mt-1.5 text-[11.5px] text-onbrand/75">
        {carrito.items.length} {carrito.items.length === 1 ? 'producto' : 'productos'} ·{' '}
        {unidadesCarrito} {unidadesCarrito === 1 ? 'unidad' : 'unidades'}
      </div>
      <button
        type="button"
        onClick={() => carrito.irARevisar?.()}
        disabled={!carrito.puedeRevisar}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-onbrand/15 px-4 text-sm font-bold text-onbrand transition hover:bg-onbrand/25 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon name="cart" className="h-4 w-4" />
        Ver carrito
      </button>
    </div>
  )
}

// Barra compacta para pantallas angostas: cuando el layout no tiene columna
// lateral, el total y el acceso al carrito quedan pegados bajo el encabezado
// para no perderlos al deslizar el formulario.
function BarraTotal({ carrito, totalCompra, unidadesCarrito }) {
  return (
    <div data-testid="carrito-barra" className="sticky top-20 z-10 lg:hidden">
      <div className="flex items-center justify-between gap-3 rounded-[14px] border border-fono/40 bg-gradient-to-br from-fono-dark via-fono to-fono px-4 py-3 shadow-lg shadow-black/25">
        <div className="min-w-0">
          <div className="truncate text-[10.5px] font-semibold uppercase tracking-[.08em] text-onbrand/75">
            {carrito.items.length === 0
              ? 'Sin productos'
              : `${carrito.items.length} ${carrito.items.length === 1 ? 'producto' : 'productos'} · ${unidadesCarrito} ${unidadesCarrito === 1 ? 'unidad' : 'unidades'}`}
          </div>
          <div className="text-xl font-semibold tracking-tight tabular-nums text-onbrand">
            {gs(totalCompra)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => carrito.irARevisar?.()}
          disabled={!carrito.puedeRevisar}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-onbrand/15 px-4 text-sm font-bold text-onbrand transition hover:bg-onbrand/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name="cart" className="h-4 w-4" />
          Ver carrito
        </button>
      </div>
    </div>
  )
}

export default function VistaCargarVenta({ tradeInDraft, onTradeInConsumed }) {
  const { sesion } = useSesion()
  const angosta = usePantallaAngosta()
  const ventas = listVentas()
  const [carrito, setCarrito] = useState({
    items: [],
    quitar: null,
    irARevisar: null,
    puedeRevisar: false,
  })

  const d = useMemo(() => {
    const hoy = ventasDelDia(ventas, fechaClave())
    const total = hoy.reduce((a, v) => a + num(v.precio), 0)
    // Cobrado vs pendiente de hoy para el vendedor de la sesión (los pagos
    // confirmados son los que importan, no lo facturado).
    const delVendedor = ventasDelDia(ventas, fechaClave(), sesion?.vendedorId)
    const cobrado = delVendedor.reduce((sum, v) => sum + cobradoDeVenta(v), 0)
    const pagadas = delVendedor.filter(v => v.estadoPago === 'Pagado').length
    const pendiente = Math.max(0, totalesVendedor(ventas, sesion?.vendedorId).hoy - cobrado)
    return {
      total,
      cant: hoy.length,
      ticket: hoy.length ? total / hoy.length : 0,
      cobrado,
      pendiente,
      pagadas,
      pendientes: delVendedor.length - pagadas,
    }
  }, [ventas, sesion?.vendedorId])

  const totalCompra = carrito.items.reduce((a, it) => a + it.precio * (it.quantity || 1), 0)
  const unidadesCarrito = carrito.items.reduce((a, it) => a + (it.quantity || 1), 0)

  if (!sesion?.esPropietario)
    return (
      <div className="flex flex-col gap-5">
        {angosta && (
          <BarraTotal
            carrito={carrito}
            totalCompra={totalCompra}
            unidadesCarrito={unidadesCarrito}
          />
        )}
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]">
          <div className="flex min-w-0 flex-col gap-5">
            <FormularioVenta
              onCarrito={setCarrito}
              tradeInDraft={tradeInDraft}
              onTradeInConsumed={onTradeInConsumed}
            />
          </div>
          <div className="flex flex-col gap-4 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
            <Caja className="overflow-hidden">
              <div className="border-b border-fono/20 bg-fono/[.05] px-5 py-4">
                <span className="font-semibold tracking-tight">Tu día</span>
              </div>
              <div className="grid grid-cols-2 divide-x divide-ink-600">
                <div className="min-w-0 p-4">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-mute">
                    Cobrado
                  </div>
                  <div className="mt-1 truncate text-lg font-semibold tracking-tight text-ok tabular-nums">
                    {gs(d.cobrado)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-mute">
                    {d.pagadas} {d.pagadas === 1 ? 'pagada' : 'pagadas'}
                  </div>
                </div>
                <div className="min-w-0 p-4">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-mute">
                    Pendiente
                  </div>
                  <div className="mt-1 truncate text-lg font-semibold tracking-tight text-bad tabular-nums">
                    {gs(d.pendiente)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-mute">
                    {d.pendientes} {d.pendientes === 1 ? 'pendiente' : 'pendientes'}
                  </div>
                </div>
              </div>
            </Caja>
            {!angosta && (
              <TotalVenta
                carrito={carrito}
                totalCompra={totalCompra}
                unidadesCarrito={unidadesCarrito}
              />
            )}
          </div>
        </div>
      </div>
    )

  return (
    <div className="flex flex-col gap-5">
      {angosta && (
        <BarraTotal carrito={carrito} totalCompra={totalCompra} unidadesCarrito={unidadesCarrito} />
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]">
        {/* ── Columna principal ────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-5">
          <FormularioVenta
            onCarrito={setCarrito}
            tradeInDraft={tradeInDraft}
            onTradeInConsumed={onTradeInConsumed}
          />
        </div>

        {/* ── Columna lateral ──────────────────────────────────────── */}
        <div
          data-testid="resumen-columna"
          className="flex flex-col gap-4 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto"
        >
          {/* Esta compra */}
          <Caja
            data-testid="resumen-compra"
            className="flex max-h-[70vh] flex-col overflow-hidden shadow-xl shadow-black/10 lg:max-h-[calc(100dvh-18rem)]"
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-fono/20 bg-fono/[.05] px-5 py-4">
              <span className="font-semibold tracking-tight">Resumen de compra</span>
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
                <div className="min-h-0 flex-1 divide-y divide-ink-600 overflow-y-auto">
                  {carrito.items.map(it => (
                    <div
                      key={it.key}
                      className="flex items-center justify-between gap-2 px-5 py-2.5"
                    >
                      <span className="min-w-0 truncate text-sm">
                        {it.nombre}
                        {it.serials?.length > 0 && (
                          <small className="ml-2 text-xs text-fono-light">
                            {serialEnmascarado(it.serials[0])}
                          </small>
                        )}
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-medium tabular-nums">{gs(it.precio)}</span>
                        {it.key !== '__actual__' && carrito.quitar && (
                          <button
                            onClick={() => carrito.quitar(it.key)}
                            className="text-mute transition hover:text-bad"
                            title="Quitar"
                            aria-label={`Quitar ${it.nombre || 'producto'} de la venta`}
                          >
                            <Icon name="trash" className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex shrink-0 items-center justify-between border-t border-fono/20 px-5 py-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-mute">
                    Total
                  </span>
                  <span className="text-lg font-semibold tabular-nums">{gs(totalCompra)}</span>
                </div>
              </>
            )}
          </Caja>

          {!angosta && (
            <TotalVenta
              carrito={carrito}
              totalCompra={totalCompra}
              unidadesCarrito={unidadesCarrito}
            />
          )}

          {/* Ayuda */}
          <div className="flex gap-2.5 rounded-[14px] border border-fono/25 bg-fono/[.07] p-4">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-fono-light" />
            <p className="text-xs leading-relaxed text-mute">
              Cargá el cliente y agregá los productos: el total y la lista se arman solos. Antes de
              guardar, revisá el carrito para cobrar todo junto.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
