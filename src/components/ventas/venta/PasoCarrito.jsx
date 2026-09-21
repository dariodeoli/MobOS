import { Input, Label, MoneyInput } from '@/components/ui'
import ListaVenta from './ListaVenta'
import AutorizacionDescuento from './AutorizacionDescuento'
import AutorizacionBloque from './AutorizacionBloque'
import EncabezadoBloque from './EncabezadoBloque'
import { gs } from '@/utils/calculos'

// Lo que se está vendiendo: lista editable, ajustes de la venta (descuento
// extra y fecha) y autorizaciones pendientes. Es la única lista de la venta:
// el total final vive en el resumen fijo de la columna.
export default function PasoCarrito({
  items,
  productos,
  familias,
  esDemo,
  guardando,
  puedeDescontar,
  precioDe,
  totalCarrito,
  quitarItem,
  editarItem,
  onImei,
  descuento,
  setDescuento,
  montoDescuento,
  customer,
  onAuthDescuento,
  montoPrecioBajo,
  productoBajoId,
  onAuthPrecio,
  tieneCupon,
  f,
  setF,
}) {
  const unidades = items.reduce((a, it) => a + (it.quantity || 1), 0)

  return (
    <section
      id="pos-resumen-venta"
      className="scroll-mt-32 overflow-hidden rounded-2xl border border-ink-600 bg-ink-800"
    >
      <div className="border-b border-ink-600 bg-ink-700/50 px-3.5 py-2.5">
        <EncabezadoBloque
          titulo="Productos de esta venta"
          descripcion="Revisá cantidades, precios, IMEI y descuentos."
          extra={
            <span className="shrink-0 text-xs text-mute">
              {items.length} {items.length === 1 ? 'producto' : 'productos'} · {unidades}{' '}
              {unidades === 1 ? 'unidad' : 'unidades'}
            </span>
          }
        />
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

      <div className="space-y-3.5 border-t border-ink-600 px-3.5 py-2.5">
        <div>
          <Label htmlFor="descuento-extra-gs">Descuento extra (Gs)</Label>
          <MoneyInput
            id="descuento-extra-gs"
            value={descuento}
            onValueChange={setDescuento}
            placeholder="0"
          />
          {!puedeDescontar && (
            <p className="mt-1 text-xs text-mute">
              El descuento necesita autorización de gerencia: pedila acá y seguí cuando esté
              aprobada.
            </p>
          )}
          {tieneCupon && (
            <p className="mt-1 text-xs text-fono-light">
              Esta venta tiene cupón: el descuento extra debe quedar en cero.
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="fecha">Fecha</Label>
          <Input
            id="fecha"
            type="date"
            value={f.fecha}
            onChange={e => setF(s => ({ ...s, fecha: e.target.value, fechaManual: true }))}
          />
        </div>

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

      <div className="flex items-center justify-between border-t border-ink-600 bg-ink-700 px-3.5 py-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-mute">
          Subtotal de productos
        </span>
        <span className="text-lg font-extrabold tabular-nums text-fore">{gs(totalCarrito)}</span>
      </div>
    </section>
  )
}
