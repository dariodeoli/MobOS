import { Label, MoneyInput } from '@/components/ui'
import ListaVenta from './ListaVenta'
import AutorizacionDescuento from './AutorizacionDescuento'
import AutorizacionBloque from './AutorizacionBloque'
import EncabezadoBloque from './EncabezadoBloque'
import { gs } from '@/utils/calculos'
import { temaV2Activo } from '@/lib/temaV2'
import { cn } from '@/lib/utils'
import { LIMITE_MONTO_VENTAS } from '@/utils/moneda'

// Lo que se está vendiendo: lista editable, ajustes de la venta (descuento
// extra) y autorizaciones pendientes. Es la única lista de la venta: el total
// final vive en el resumen fijo de la columna.
export default function PasoCarrito({
  items,
  productos,
  familias,
  esDemo,
  guardando,
  puedeDescontar,
  precioDe,
  totalCarrito,
  totalGeneral,
  montoDelivery = 0,
  quitarItem,
  editarItem,
  onImei,
  descuento,
  setDescuento,
  montoDescuento,
  onBorrarDescuentos,
  onVaciarCarrito,
  customer,
  onAuthDescuento,
  montoPrecioBajo,
  productoBajoId,
  onAuthPrecio,
  tieneCupon,
}) {
  const unidades = items.reduce((a, it) => a + (it.quantity || 1), 0)
  const descuentoTotal = montoDescuento + items.reduce((suma, it) => {
    const pct = Number(String(it.descuentoPct ?? '').replace('%', '')) || 0
    const fijo = Number(String(it.descuento ?? '').replace(/\D/g, '')) || 0
    if (pct > 0) return suma + Math.round((Number(it.precio || 0) * (it.quantity || 1) * pct) / 100)
    return suma + Math.min(fijo, Number(it.precio || 0) * (it.quantity || 1))
  }, 0)

  return (
    <section
      id="pos-resumen-venta"
      data-testid="pos-bloque-carrito"
      className={cn(
        // #281 · identidad de color: carrito = verde de venta (ok).
        'scroll-mt-32 overflow-hidden rounded-2xl border border-ok/35 bg-ok/[.04] shadow-card',
        // El carrito NO es sticky: el cobro va debajo en la misma columna y un
        // bloque pegado se montaba sobre él al scrollear. El botón Cobrar queda
        // fijo al pie (PasoCobro).
        // Lenguaje v2 (#241, paso 5): el carrito completo detrás del flag.
        temaV2Activo() && 'tema-v2',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ok/20 bg-ok/[.06] px-3 py-2">
        <EncabezadoBloque
          compacto
          titulo="Productos de esta venta"
          tono="text-ok"
          extra={
            <span className="shrink-0 text-xs text-mute">
              {items.length} {items.length === 1 ? 'producto' : 'productos'} · {unidades}{' '}
              {unidades === 1 ? 'unidad' : 'unidades'}
            </span>
          }
        />
        {items.length > 0 && (
          <button
            type="button"
            onClick={onVaciarCarrito}
            disabled={guardando}
            className="inline-flex min-h-11 items-center rounded-lg border border-ink-500 px-2.5 py-1 text-xs font-semibold text-mute transition hover:border-bad hover:text-bad disabled:opacity-50 md:min-h-0"
          >
            Vaciar carrito
          </button>
        )}
      </div>

      <ListaVenta
        items={items}
        productos={productos}
        familias={familias}
        esDemo={esDemo}
        guardando={guardando}
        puedeDescontar={puedeDescontar}
        precioDe={precioDe}
        quitarItem={quitarItem}
        editarItem={editarItem}
        onImei={onImei}
      />

      {/* Ajuste de la venta: el descuento extra se escribe al lado de su rótulo
          para que el carrito gane altura. */}
      {items.length > 0 && (
        <div className="space-y-2 border-t border-ink-600 px-3.5 py-2.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Label htmlFor="descuento-extra-gs" className="mb-0 shrink-0">
              Descuento extra (Gs)
            </Label>
            <MoneyInput
              id="descuento-extra-gs"
              max={LIMITE_MONTO_VENTAS}
              value={descuento}
              onValueChange={setDescuento}
              placeholder="0"
              className="h-9 w-36"
            />
            {(Number(montoDescuento || 0) > 0 || items.some(it => it.descuento || it.descuentoPct)) && (
              <button
                type="button"
                onClick={onBorrarDescuentos}
                className="inline-flex min-h-11 items-center rounded-lg border border-ink-500 px-2.5 py-1.5 text-xs font-semibold text-mute transition hover:border-warn hover:text-warn md:min-h-0"
              >
                Borrar descuento
              </button>
            )}
          </div>
          {!puedeDescontar && (
            <p className="text-xs text-mute">
              El descuento necesita autorización de gerencia: pedila acá y seguí cuando esté
              aprobada.
            </p>
          )}
          {tieneCupon && (
            <p className="text-xs text-fono-light">
              Esta venta tiene cupón: el descuento extra debe quedar en cero.
            </p>
          )}

          {/* La venta siempre se registra con la fecha del día (#229). */}
          {!esDemo && !puedeDescontar && montoDescuento > 0 && (
            <AutorizacionDescuento
              monto={montoDescuento}
              customerId={customer?.id || null}
              onSelect={onAuthDescuento}
              bloqueado={guardando}
            />
          )}

          {!esDemo && !puedeDescontar && montoPrecioBajo > 0 && (
            <AutorizacionBloque
              kind="BELOW_LIST_PRICE"
              titulo="Precio por debajo de lista"
              descripcion="El precio manual de una línea está por debajo del precio de lista: gerencia tiene que autorizarlo."
              requestedValue={{
                discountPyg: montoPrecioBajo,
                ...(productoBajoId ? { productId: productoBajoId } : {}),
              }}
              entity={productoBajoId ? 'PRODUCT' : undefined}
              entityId={productoBajoId || undefined}
              customerId={customer?.id || null}
              monto={montoPrecioBajo}
              onSelect={onAuthPrecio}
              bloqueado={guardando}
            />
          )}
        </div>
      )}

      <div className="border-t border-ink-600 bg-ink-700 px-3.5 py-2.5">
        <div className="pos-money-row flex flex-wrap items-center justify-between gap-x-2 text-xs text-mute">
          <span>Subtotal</span>
          <span className="pos-money-value tabular-nums">{gs(totalCarrito)}</span>
        </div>
        {descuentoTotal > 0 && (
          <div className="pos-money-row flex flex-wrap items-center justify-between gap-x-2 text-xs text-warn">
            <span>Descuento</span>
            <span className="pos-money-value tabular-nums">− {gs(descuentoTotal)}</span>
          </div>
        )}
        {Number(montoDelivery || 0) > 0 && (
          <div className="pos-money-row flex flex-wrap items-center justify-between gap-x-2 text-xs text-mute">
            <span>Envío</span>
            <span className="pos-money-value tabular-nums">{gs(montoDelivery)}</span>
          </div>
        )}
        {/* El Total vive acá, una sola vez: `cobro-total` envuelve la fila y
            `carrito-total` es el importe (ambos alcanzables en un solo lugar). */}
        <div data-testid="cobro-total" className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 border-t border-fono/20 pt-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-mute">Total</span>
          <strong data-testid="carrito-total" className="pos-money-value v2-numero whitespace-nowrap text-[clamp(1.25rem,5vw,1.75rem)] font-extrabold tracking-tight tabular-nums text-fore">
            {gs(totalGeneral ?? totalCarrito)}
          </strong>
        </div>
      </div>
    </section>
  )
}
