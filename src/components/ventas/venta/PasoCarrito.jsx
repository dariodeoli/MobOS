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
  totalPagado = 0,
  pendiente = 0,
  conPagos = false,
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
  f,
  cliente,
  vendedor,
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
      className={cn(
        'scroll-mt-32 overflow-hidden rounded-2xl border border-ink-600 bg-ink-800 shadow-card',
        // Lenguaje v2 (#241, paso 5): el carrito completo detrás del flag.
        temaV2Activo() && 'tema-v2',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-600 bg-ink-700/50 px-3.5 py-2">
        <EncabezadoBloque
          titulo="Productos de esta venta"
          descripcion={[cliente ? `Cliente: ${cliente}` : 'Consumidor final', vendedor, f?.entrega].filter(Boolean).join(' · ')}
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
        <div className="flex items-center justify-between text-xs text-mute">
          <span>Subtotal</span>
          <span className="tabular-nums">{gs(totalCarrito)}</span>
        </div>
        {descuentoTotal > 0 && (
          <div className="flex items-center justify-between text-xs text-warn">
            <span>Descuento</span>
            <span className="tabular-nums">− {gs(descuentoTotal)}</span>
          </div>
        )}
        {Number(montoDelivery || 0) > 0 && (
          <div className="flex items-center justify-between text-xs text-mute">
            <span>Envío</span>
            <span className="tabular-nums">{gs(montoDelivery)}</span>
          </div>
        )}
        <div className="mt-1 flex items-baseline justify-between border-t border-fono/20 pt-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-mute">Total</span>
          <span className="v2-numero text-2xl font-extrabold tracking-tight tabular-nums text-fore">
            {gs(totalGeneral ?? totalCarrito)}
          </span>
        </div>
        {/* Al pie de la épica (#148 §5): lo pagado y lo pendiente de la venta,
            para leer el estado sin bajar al bloque de cobro. */}
        {conPagos && (
          <div className="mt-1.5 space-y-0.5 border-t border-ink-600/60 pt-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-mute">Pagado</span>
              <span className="tabular-nums font-semibold text-ok" data-testid="carrito-pagado">{gs(totalPagado)}</span>
            </div>
            {pendiente > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-warn">Pendiente</span>
                <span className="tabular-nums font-semibold text-warn" data-testid="carrito-pendiente">{gs(pendiente)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
